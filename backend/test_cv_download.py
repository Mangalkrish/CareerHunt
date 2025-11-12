#!/usr/bin/env python3
"""
Test script for download_and_parse_cv function
Usage: python test_cv_download.py <url>
"""

import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(__file__))

# Load environment variables
try:
    from dotenv import load_dotenv
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.env')
    load_dotenv(config_path)
except ImportError:
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.env')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    parts = line.split('=', 1)
                    key = parts[0].strip()
                    value = parts[1].strip() if len(parts) > 1 else ''
                    os.environ[key] = value

# Import the function
from main import download_and_parse_cv

def test_cv_download(url):
    """Test the download_and_parse_cv function with a given URL"""
    print(f"\n{'='*80}")
    print(f"Testing CV Download Function")
    print(f"{'='*80}")
    print(f"URL: {url}")
    print(f"{'='*80}\n")
    
    try:
        result = download_and_parse_cv(url)
        
        if result.startswith("ERROR:"):
            print(f"\n❌ ERROR: {result}")
            return False
        else:
            print(f"\n✅ SUCCESS!")
            print(f"Extracted text length: {len(result)} characters")
            print(f"\nFirst 500 characters of extracted text:")
            print("-" * 80)
            print(result[:500])
            if len(result) > 500:
                print("...")
            print("-" * 80)
            return True
            
    except Exception as e:
        print(f"\n❌ EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_cv_download.py <url>")
        print("\nExample URLs to test:")
        print("  - A public PDF URL")
        print("  - A Cloudinary URL")
        print("\nExample:")
        print("  python test_cv_download.py https://res.cloudinary.com/djkkder2z/image/upload/v1762960615/ubqd3m5j0ndfjce08rqn.pdf")
        sys.exit(1)
    
    url = sys.argv[1]
    success = test_cv_download(url)
    sys.exit(0 if success else 1)

