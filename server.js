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

// Product Hunt GraphQL query with pagination
async function searchProductHunt(criteria, category = null, maxProducts = 200) {
  // Build topic filter if category specified
  const topicFilter = category ? `, topic: "${category}"` : '';
  
  let allPosts = [];
  let hasNextPage = true;
  let afterCursor = null;
  let batchCount = 0;
  const maxBatches = 10; // Max 10 batches of 20 = 200 products (safer for rate limits)
  
  try {
    console.log(`Querying Product Hunt for: ${criteria}${category ? ` in category: ${category}` : ''}`);
    
    // Fetch products in batches (API limits to ~20 per request)
    while (hasNextPage && allPosts.length < maxProducts && batchCount < maxBatches) {
      const afterParam = afterCursor ? `, after: "${afterCursor}"` : '';
      
      const query = `
        query {
          posts(first: 20, order: VOTES${topicFilter}${afterParam}) {
            edges {
              cursor
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
                reviewsRating
                reviewsCount
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;
      
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

      const postsData = response.data.data.posts;
      const newPosts = postsData.edges.map(edge => edge.node);
      allPosts = allPosts.concat(newPosts);
      
      hasNextPage = postsData.pageInfo.hasNextPage;
      afterCursor = postsData.pageInfo.endCursor;
      batchCount++;
      
      console.log(`Batch ${batchCount}: Fetched ${newPosts.length} products (total: ${allPosts.length})`);
      
      // Stop if no more products in this batch
      if (newPosts.length === 0) break;
      
      // Add delay between requests to avoid rate limiting (500ms)
      if (hasNextPage && allPosts.length < maxProducts && batchCount < maxBatches) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Total products fetched: ${allPosts.length} from ${batchCount} batches`);
    
    // Filter by criteria relevance (relaxed - OR logic, any keyword match)
    const criteriaLower = criteria.toLowerCase();
    const keywords = criteriaLower.split(' ').filter(w => w.length > 2);
    
    // If no meaningful keywords, return all (rely on category filter)
    if (keywords.length === 0) {
      console.log('No keywords to filter by, returning all products');
      return allPosts;
    }
    
    const relevantPosts = allPosts.filter(post => {
      const searchText = `${post.name} ${post.tagline} ${post.description || ''}`.toLowerCase();
      // Match if ANY keyword is found (relaxed filtering)
      return keywords.some(keyword => searchText.includes(keyword));
    });

    console.log(`Filtered to ${relevantPosts.length} relevant products (${keywords.length} keywords)`);
    
    // If filtering removes everything, return top products anyway
    if (relevantPosts.length === 0 && allPosts.length > 0) {
      console.log('No keyword matches, returning all fetched products');
      return allPosts;
    }
    
    return relevantPosts;

  } catch (error) {
    console.error('Product Hunt API error:', error.response?.data || error.message);
    
    // Check for rate limiting
    if (error.response?.status === 429) {
      const resetTime = error.response.headers['x-rate-limit-reset'];
      const resetMinutes = resetTime ? Math.ceil(resetTime / 60) : 10;
      throw new Error(`RATE_LIMIT:${resetMinutes}`);
    }
    
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
    
    // Relevance scoring (HEAVILY WEIGHTED)
    const name = (product.name || '').toLowerCase();
    const tagline = (product.tagline || '').toLowerCase();
    const description = (product.description || '').toLowerCase();
    
    let relevanceScore = 0;
    let keywordMatches = 0;
    keywords.forEach(word => {
      if (name.includes(word)) {
        relevanceScore += 50;
        keywordMatches++;
      }
      if (tagline.includes(word)) {
        relevanceScore += 35; // Increased from 30 to compensate for removed topics
        keywordMatches++;
      }
      if (description.includes(word)) {
        relevanceScore += 20; // Increased from 15
        keywordMatches++;
      }
    });
    
    // Require minimum relevance - filter out products with no keyword matches
    if (relevanceScore === 0) {
      return {
        ...product,
        score: 0,
        relevanceScore: 0
      };
    }
    
    // Popularity metrics (REDUCED WEIGHT)
    const votesScore = Math.min(votesCount / 50, 15); // Reduced from /10, cap 15 (was 30)
    const reviewScore = reviewsCount > 0 ? Math.min(reviewsCount, 10) : 0; // Reduced cap to 10 (was 25)
    const ratingScore = reviewsRating > 0 ? reviewsRating * 2 : 0; // Reduced from *5 to *2 (max 10 instead of 25)
    const popularityBonus = votesCount > 1000 ? 5 : 0; // Reduced from 20/10 to 5
    
    // Calculate final score with relevance dominating
    const rawScore = relevanceScore + votesScore + reviewScore + ratingScore + popularityBonus;
    // Normalize to 0-100 scale
    // Max relevance: ~105 per keyword * avg 3 keywords = ~315
    // Max popularity: 15 + 10 + 10 + 5 = 40
    // Max total: ~355
    const totalScore = Math.min((rawScore / 355) * 100, 100);
    
    return {
      ...product,
      score: totalScore,
      relevanceScore: relevanceScore,
      keywordMatches: keywordMatches
    };
  }).filter(p => p.relevanceScore > 0).sort((a, b) => b.score - a.score);
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
    const { criteria, category, minRating = 0 } = req.body;
    
    if (!criteria || criteria.trim().length === 0) {
      return res.status(400).json({ error: 'Criteria is required' });
    }

    console.log(`Scanning for: ${criteria}${category ? ` [Category: ${category}]` : ''} [Min Rating: ${minRating}]`);
    
    // Search Product Hunt (fetches up to 200 products via pagination with rate limit protection)
    const allProducts = await searchProductHunt(criteria, category, 200);
    
    if (allProducts.length === 0) {
      return res.json({ 
        results: [], 
        message: 'No products found on Product Hunt. Try different keywords or remove category filter.' 
      });
    }

    // Apply rating filter
    const filteredProducts = minRating > 0 
      ? allProducts.filter(product => (product.reviewsRating || 0) >= minRating)
      : allProducts;

    if (filteredProducts.length === 0) {
      return res.json({ 
        results: [], 
        message: `No products found with ${minRating}+ star rating. Try lowering the rating filter.` 
      });
    }

    // Score and rank products
    const rankedProducts = scoreProducts(filteredProducts, criteria);
    
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
        justification: justification
      };
    });

    res.json({ results });

  } catch (error) {
    console.error('Scan error:', error);
    
    // Handle rate limiting errors
    if (error.message?.startsWith('RATE_LIMIT:')) {
      const minutes = error.message.split(':')[1];
      return res.status(429).json({ 
        error: 'Rate Limit Exceeded',
        message: `Too many searches! Product Hunt's API rate limit has been reached. Please wait ${minutes} minutes and try again. Pro tip: Use category filters to reduce API calls.`,
        retryAfter: parseInt(minutes) * 60
      });
    }
    
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
