#!/bin/bash

# Exit on error
set -e

echo "🚀 Setting up SAWAARI Monorepo locally..."

# 1. Setup Environment Variables
echo "⚙️ Creating environment files from templates..."
if [ ! -f sawaari-backend/.env ]; then
    cp sawaari-backend/.env.example sawaari-backend/.env
    echo "✅ Created sawaari-backend/.env"
else
    echo "ℹ️ sawaari-backend/.env already exists."
fi

if [ ! -f sawaari-frontend/.env.local ]; then
    cp sawaari-frontend/.env.example sawaari-frontend/.env.local
    echo "✅ Created sawaari-frontend/.env.local"
else
    echo "ℹ️ sawaari-frontend/.env.local already exists."
fi

# 2. Check for Docker Compose and Start DB & Redis
if ! command -v docker &> /dev/null
then
    echo "⚠️ Docker is not installed or not running. Please start PostgreSQL (PostGIS) and Redis manually on ports 5435 and 6380."
else
    echo "🐳 Starting PostgreSQL (PostGIS) and Redis containers..."
    docker compose up -d
    echo "✅ Docker containers successfully started."
fi

# 3. Clean and Install Dependencies
echo "📦 Installing npm dependencies across workspaces..."
npm install --legacy-peer-deps

echo ""
echo "🎉 Setup complete! You can now start the applications:"
echo "👉 Run Backend:  npm run dev:backend"
echo "👉 Run Frontend: npm run dev:frontend"
