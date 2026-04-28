#!/bin/bash

# Supplier Delivery Appointment System - Startup Script

echo "=================================================="
echo "🚀 Supplier Delivery Appointment System"
echo "Startup Script"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to start backend
start_backend() {
    echo -e "${YELLOW}📦 Starting Backend...${NC}"
    cd backend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
        npm install
    fi
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo -e "${RED}⚠️  .env file not found!${NC}"
        cp .env.example .env
        echo -e "${YELLOW}Created .env from .env.example - Please edit it with your database URL${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Backend starting on http://localhost:5000${NC}"
    npm run dev &
    BACKEND_PID=$!
}

# Function to start frontend
start_frontend() {
    echo -e "${YELLOW}🎨 Starting Frontend...${NC}"
    cd frontend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing dependencies...${NC}"
        npm install
    fi
    
    echo -e "${GREEN}✅ Frontend starting on http://localhost:3000${NC}"
    npm run dev &
    FRONTEND_PID=$!
}

# Check if running on Windows (Git Bash)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows version
    echo -e "${YELLOW}Windows detected - Starting both servers in separate windows...${NC}"
    
    # Get to the directory
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    cd "$SCRIPT_DIR"
    
    # Start backend
    start "$@" "Backend Server" cmd /c "cd backend && npm run dev"
    
    # Wait a moment
    sleep 2
    
    # Start frontend  
    start "$@" "Frontend Server" cmd /c "cd frontend && npm run dev"
    
    echo -e "${GREEN}=================================================="
    echo "✅ Servers Started!"
    echo "=================================================="
    echo -e "Backend:  ${GREEN}http://localhost:5000${NC}"
    echo -e "Frontend: ${GREEN}http://localhost:3000${NC}"
    echo "=================================================="
    
else
    # Unix/Linux/Mac version
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    cd "$SCRIPT_DIR"
    
    start_backend
    if [ $? -ne 0 ]; then
        echo -e "${RED}Please configure your .env file and try again${NC}"
        exit 1
    fi
    
    # Wait for backend to start
    sleep 2
    
    start_frontend
    
    echo -e "${GREEN}=================================================="
    echo "✅ Servers Started!"
    echo "=================================================="
    echo -e "Backend:  ${GREEN}http://localhost:5000${NC}"
    echo -e "Frontend: ${GREEN}http://localhost:3000${NC}"
    echo "=================================================="
    echo ""
    echo "Press CTRL+C to stop all servers"
    echo ""
    
    # Wait for signals
    wait
fi
