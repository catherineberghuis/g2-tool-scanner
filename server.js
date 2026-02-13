require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const G2_API_TOKEN = process.env.G2_API_TOKEN;
const G2_API_BASE = 'https://data.g2.com/api/v1';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// G2 API Client
async function searchG2Products(criteria) {
  try {
    const response = await axios.get(`${G2_API_BASE}/products`, {
      headers: {
        'Authorization': `Token token=${G2_API_TOKEN}`,
        'Content-Type': 'application/vnd.api+json'
      },
      params: {
        'filter[name]': criteria,
        'page[size]': 50
      }
    });
    return response.data.data || [];
  } catch (error) {
    console.error('G2 API Error:', error.response?.data || error.message);
    throw error;
  }
}

async function getProductReviews(productId) {
  try {
    const response = await axios.get(`${G2_API_BASE}/products/${productId}/survey-responses`, {
      headers: {
        'Authorization': `Token token=${G2_API_TOKEN}`,
        'Content-Type': 'application/vnd.api+json'
      },
      params: {
        'page[size]': 10
      }
    });
    return response.data.data || [];
  } catch (error) {
    console.error('Reviews API Error:', error.response?.data || error.message);
    return [];
  }
}

// Ranking algorithm
function scoreProducts(products) {
  return products.map(product => {
    const attrs = product.attributes;
    const starRating = attrs.star_rating || 0;
    const reviewCount = attrs.review_count || 0;
    const avgRating = parseFloat(attrs.avg_rating) || 0;
    
    // Scoring weights
    const ratingScore = starRating * 20; // 0-100
    const reviewScore = Math.min(reviewCount / 10, 30); // Cap at 30
    const avgScore = avgRating * 3; // 0-30
    const popularityBonus = reviewCount > 100 ? 20 : reviewCount > 50 ? 10 : 0;
    
    const totalScore = ratingScore + reviewScore + avgScore + popularityBonus;
    
    return {
      id: product.id,
      score: totalScore,
      name: attrs.name,
      starRating: starRating,
      reviewCount: reviewCount,
      avgRating: avgRating,
      description: attrs.description || attrs.detail_description || 'No description available',
      url: attrs.public_detail_url || `https://www.g2.com/products/${attrs.slug}/reviews`,
      imageUrl: attrs.image_url
    };
  }).sort((a, b) => b.score - a.score);
}

async function getTopReviewHighlight(productId) {
  const reviews = await getProductReviews(productId);
  if (reviews.length > 0) {
    const topReview = reviews[0];
    const loveAnswer = topReview.attributes.comment_answers?.love?.value;
    return loveAnswer || 'Users highly recommend this product.';
  }
  return 'Highly rated by G2 users.';
}

// API Endpoint
app.post('/api/scan', async (req, res) => {
  try {
    const { criteria } = req.body;
    
    if (!criteria || criteria.trim().length === 0) {
      return res.status(400).json({ error: 'Criteria is required' });
    }

    console.log(`Scanning for: ${criteria}`);
    
    // Search products
    const products = await searchG2Products(criteria);
    
    if (products.length === 0) {
      return res.json({ results: [], message: 'No products found matching your criteria.' });
    }

    // Score and rank products
    const rankedProducts = scoreProducts(products);
    const top3 = rankedProducts.slice(0, 3);

    // Get review highlights for top 3
    const resultsWithHighlights = await Promise.all(
      top3.map(async (product, index) => {
        const highlight = await getTopReviewHighlight(product.id);
        
        return {
          rank: index + 1,
          name: product.name,
          url: product.url,
          rating: product.starRating,
          avgRating: product.avgRating,
          reviewCount: product.reviewCount,
          description: product.description,
          imageUrl: product.imageUrl,
          justification: {
            score: Math.round(product.score),
            highlight: highlight,
            reasons: [
              `${product.starRating}/5 star rating from ${product.reviewCount} reviews`,
              `Average rating: ${product.avgRating}/10`,
              product.reviewCount > 100 ? 'Highly popular choice' : 'Trusted by users'
            ]
          }
        };
      })
    );

    res.json({ results: resultsWithHighlights });

  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      error: 'Failed to scan G2 marketplace',
      message: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🤖 G2 Tool Scanner running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT}`);
});
