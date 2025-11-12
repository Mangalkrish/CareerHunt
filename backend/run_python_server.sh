#!/bin/bash

# Script to run the FastAPI Python server

# Navigate to backend directory
cd "$(dirname "$0")"

# Activate virtual environment
source ../venv_ai/bin/activate

# Check if uvicorn is installed
if ! python -c "import uvicorn" 2>/dev/null; then
    echo "Installing uvicorn and fastapi..."
    pip install uvicorn fastapi
fi

# Check if required packages are installed
echo "Checking dependencies..."
python -c "import fastapi, pdfplumber, chromadb, sentence_transformers" 2>/dev/null || {
    echo "Installing required packages..."
    pip install fastapi uvicorn pdfplumber requests chromadb sentence-transformers google-genai cloudinary python-dotenv
}

# Run the FastAPI server
echo "Starting FastAPI server on http://localhost:8000"
echo "Press Ctrl+C to stop the server"
echo ""
uvicorn main:app --reload --host 0.0.0.0 --port 8000

