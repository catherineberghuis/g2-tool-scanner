require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PRODUCT_HUNT_TOKEN = process.env.PRODUCT_HUNT_TOKEN;
const PRODUCT_HUNT_API = 'https://api.producthunt.com/v2/api/graphql';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Product Hunt GraphQL query
async function searchProductHunt(criteria) {
  const query = `
    query {
      posts(first: 50, order: VOTES) {
        edges {
          node {
            id
            name
            tagline
            description
            votesCount
            url
            website
            thumbnail {
              url
            }
            topics {
              edges {
                node {
                  name
                }
              }
            }
            reviewsRating
            reviewsCount
          }
        }
      }
    }
  `;

  try {
    console.log(`Querying Product Hunt for: ${criteria}`);
    
    const response = await axios.post(
      PRODUCT_HUNT_API,
      { query },
      {
        headers: {
          'Authorization': `Bearer ${PRODUCT_HUNT_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    if (response.data.errors) {
      console.error('GraphQL errors:', response.data.errors);
      throw new Error(response.data.errors[0].message);
    }

    const posts = response.data.data.posts.edges.map(edge => edge.node);
    console.log(`Found ${posts.length} products from Product Hunt`);
    
    // Filter by criteria relevance
    const criteriaLower = criteria.toLowerCase();
    const keywords = criteriaLower.split(' ').filter(w => w.length > 2);
    
    const relevantPosts = posts.filter(post => {
      const searchText = `${post.name} ${post.tagline} ${post.description || ''}`.toLowerCase();
      const topics = post.topics?.edges?.map(e => e.node.name.toLowerCase()).join(' ') || '';
      const fullText = `${searchText} ${topics}`;
      
      return keywords.some(keyword => fullText.includes(keyword));
    });

    console.log(`Filtered to ${relevantPosts.length} relevant products`);
    return relevantPosts;

  } catch (error) {
    console.error('Product Hunt API error:', error.response?.data || error.message);
    throw error;
  }
}

// Ranking algorithm
function scoreProducts(products, criteria) {
  const criteriaLower = criteria.toLowerCase();
  const keywords = criteriaLower.split(' ').filter(w => w.length > 2);

  return products.map(product => {
    const votesCount = product.votesCount || 0;
    const reviewsCount = product.reviewsCount || 0;
    const reviewsRating = product.reviewsRating || 0;
    
    // Relevance scoring
    const name = (product.name || '').toLowerCase();
    const tagline = (product.tagline || '').toLowerCase();
    const description = (product.description || '').toLowerCase();
    const topics = product.topics?.edges?.map(e => e.node.name.toLowerCase()).join(' ') || '';
    
    let relevanceScore = 0;
    keywords.forEach(word => {
      if (name.includes(word)) relevanceScore += 40;
      if (tagline.includes(word)) relevanceScore += 25;
      if (description.includes(word)) relevanceScore += 10;
      if (topics.includes(word)) relevanceScore += 15;
    });
    
    // Scoring weights (normalized to 0-100 scale)
    const votesScore = Math.min(votesCount / 10, 30); // Cap at 30
    const reviewScore = reviewsCount > 0 ? Math.min(reviewsCount * 2, 25) : 0;
    const ratingScore = reviewsRating > 0 ? reviewsRating * 5 : 0; // Assuming 1-5 scale
    const popularityBonus = votesCount > 500 ? 20 : votesCount > 200 ? 10 : 0;
    
    const rawScore = votesScore + reviewScore + ratingScore + popularityBonus + relevanceScore;
    // Normalize to 0-100 scale (max possible raw score is ~170)
    const totalScore = Math.min((rawScore / 170) * 100, 100);
    
    return {
      ...product,
      score: totalScore,
      relevanceScore: relevanceScore
    };
  }).sort((a, b) => b.score - a.score);
}

// Generate justification
function generateJustification(product, rank) {
  const reasons = [];
  
  if (product.votesCount > 0) {
    reasons.push(`${product.votesCount.toLocaleString()} upvotes from Product Hunt community`);
  }
  
  if (product.reviewsCount > 0 && product.reviewsRating > 0) {
    reasons.push(`${product.reviewsRating}/5 rating from ${product.reviewsCount} reviews`);
  } else if (product.reviewsCount > 0) {
    reasons.push(`${product.reviewsCount} user reviews`);
  }
  
  if (product.votesCount > 500) {
    reasons.push('Highly popular choice in the community');
  } else if (product.votesCount > 200) {
    reasons.push('Well-regarded by users');
  } else {
    reasons.push('Trusted by early adopters');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const highlight = product.tagline || product.description?.substring(0, 150) || 'Innovative solution for your needs.';

  return {
    score: Math.round(product.score),
    highlight: highlight,
    reasons: reasons,
    medal: medals[rank - 1] || ''
  };
}

// API Endpoint
app.post('/api/scan', async (req, res) => {
  try {
    const { criteria } = req.body;
    
    if (!criteria || criteria.trim().length === 0) {
      return res.status(400).json({ error: 'Criteria is required' });
    }

    console.log(`Scanning for: ${criteria}`);
    
    // Search Product Hunt
    const allProducts = await searchProductHunt(criteria);
    
    if (allProducts.length === 0) {
      return res.json({ 
        results: [], 
        message: 'No products found on Product Hunt. Try different keywords.' 
      });
    }

    // Score and rank products
    const rankedProducts = scoreProducts(allProducts, criteria);
    
    // Get top 3
    const top3 = rankedProducts.slice(0, 3);

    // Format results
    const results = top3.map((product, index) => {
      const justification = generateJustification(product, index + 1);
      
      return {
        rank: index + 1,
        name: product.name,
        url: product.url,
        website: product.website,
        tagline: product.tagline,
        description: product.description,
        rating: product.reviewsRating || 0,
        reviewCount: product.reviewsCount || 0,
        votesCount: product.votesCount || 0,
        imageUrl: product.thumbnail?.url || `https://via.placeholder.com/100?text=${encodeURIComponent(product.name.substring(0, 2))}`,
        topics: product.topics?.edges?.map(e => e.node.name) || [],
        justification: justification
      };
    });

    res.json({ results });

  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ 
      error: 'Failed to scan Product Hunt',
      message: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Product Hunt Market Scanner'
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🤖 Product Hunt Market Scanner running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT}`);
});
