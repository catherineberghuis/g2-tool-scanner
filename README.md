# G2 Tool Scanner

A web application that scans the G2 marketplace and recommends the top 3 tools based on user-specified criteria.

## Features

- Single-page interface for easy criteria input
- Queries G2 API for matching products
- Ranks products by ratings, reviews, and features
- Displays top 3 recommendations with justifications
- Clean, modern UI with responsive design

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your G2 API token
4. Run locally: `npm start`
5. Open browser to `http://localhost:3000`

## Deployment

Deployed on Railway. Push to GitHub and connect Railway to auto-deploy.

## Environment Variables

- `G2_API_TOKEN` - Your G2 API token from https://www.g2.com/static/integrations
- `PORT` - Server port (auto-set by Railway)
