#!/usr/bin/env python3
"""
Test script for CV download and skill extraction.
Usage: python test_cv_skills.py <cv_url>
"""

import sys
import requests
import json

def test_cv_download_and_extract_skills(cv_url: str):
    """
    Test the CV download and skill extraction endpoint.
    """
    base_url = "http://localhost:8000"
    endpoint = f"{base_url}/test/cv-download-and-extract-skills"
    
    print("="*80)
    print("Testing CV Download and Skill Extraction")
    print("="*80)
    print(f"URL: {cv_url}")
    print(f"Endpoint: {endpoint}")
    print("="*80)
    print()
    
    try:
        response = requests.get(endpoint, params={"url": cv_url}, timeout=120)
        response.raise_for_status()
        
        result = response.json()
        
        if result.get("success"):
            print("✅ SUCCESS!")
            print()
            print("📥 Download Results:")
            print(f"   - Text Length: {result['download']['extracted_text_length']} characters")
            print(f"   - Preview: {result['download']['extracted_text_preview'][:200]}...")
            print()
            print("🔍 Skill Extraction Results:")
            print(f"   - Skills Count: {result['skill_extraction']['skills_count']}")
            print(f"   - Skills:")
            for i, skill in enumerate(result['skill_extraction']['skills'], 1):
                print(f"     {i}. {skill}")
            print()
            print("="*80)
            return True
        else:
            print("❌ FAILED!")
            print(f"   Step: {result.get('step', 'unknown')}")
            print(f"   Error: {result.get('error', 'Unknown error')}")
            print()
            print("="*80)
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Could not connect to FastAPI service.")
        print("   Make sure the FastAPI server is running on http://localhost:8000")
        print("   Start it with: uvicorn main:app --reload --port 8000")
        return False
    except requests.exceptions.Timeout:
        print("❌ ERROR: Request timed out (took more than 120 seconds)")
        print("   The CV might be very large or Gemini API is slow")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ ERROR: Request failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
                print(f"   Details: {json.dumps(error_detail, indent=2)}")
            except:
                print(f"   Response: {e.response.text}")
        return False
    except Exception as e:
        print(f"❌ ERROR: Unexpected error: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_cv_skills.py <cv_url>")
        print()
        print("Example:")
        print("  python test_cv_skills.py https://res.cloudinary.com/djkkder2z/image/upload/v1762960615/ubqd3m5j0ndfjce08rqn.pdf")
        print("  python test_cv_skills.py https://drive.google.com/file/d/1ytWdNlltt3qqTENRrXFn1acH7UANUODb/view?usp=sharing")
        sys.exit(1)
    
    cv_url = sys.argv[1]
    success = test_cv_download_and_extract_skills(cv_url)
    sys.exit(0 if success else 1)

