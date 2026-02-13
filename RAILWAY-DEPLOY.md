# Railway Deployment Guide

## Prerequisites
- GitHub account
- Railway account (https://railway.app)
- This repository pushed to GitHub

## Deployment Steps

### 1. Push to GitHub
```bash
# Create new repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/g2-tool-scanner.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Railway

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `g2-tool-scanner` repository
5. Railway will auto-detect Node.js and deploy

### 3. Set Environment Variables

In Railway dashboard:
1. Go to your project
2. Click "Variables" tab
3. Add the following:
   - `G2_API_TOKEN` = `e0e9241fe8d5e45d7c93856d521d2165c4a6ec789a9bb002e3646165204dc758`
   - `PORT` = (Railway sets this automatically)

### 4. Deploy

Railway will automatically:
- Install dependencies (`npm install`)
- Start server (`npm start`)
- Assign a public URL

### 5. Access Your App

Railway will provide a URL like: `https://your-app.up.railway.app`

## Troubleshooting

### Build Fails
- Check Railway logs for errors
- Verify `package.json` has correct `start` script
- Ensure Node.js version compatibility (18+)

### API Errors
- Verify `G2_API_TOKEN` is set correctly in Railway environment variables
- Check G2 API token hasn't expired at https://www.g2.com/static/integrations

### App Not Loading
- Check Railway logs: Click "View Logs" in dashboard
- Verify port binding: App uses `process.env.PORT`
- Test health endpoint: `https://your-app.up.railway.app/health`

## Local Testing

Before deploying, test locally:
```bash
npm install
npm start
# Visit http://localhost:3000
```

## Updates

To deploy updates:
```bash
git add .
git commit -m "Your changes"
git push
# Railway auto-deploys on push
```
