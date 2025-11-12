from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import List, Dict, Any
import logging
import time
import os
import json 
import numpy as np

import requests
import pdfplumber
import io
import logging
import sys
from typing import Optional

# Load environment variables from config.env
try:
    from dotenv import load_dotenv
    # Load from config/config.env (relative to backend directory)
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.env')
    load_dotenv(config_path)
except ImportError:
    # If python-dotenv is not installed, try to load manually
    config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.env')
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    # Handle spaces around = sign
                    parts = line.split('=', 1)
                    key = parts[0].strip()
                    value = parts[1].strip() if len(parts) > 1 else ''
                    os.environ[key] = value

# Cloudinary import (optional - will use if credentials available)
try:
    import cloudinary
    import cloudinary.api
    import cloudinary.utils
    CLOUDINARY_AVAILABLE = True
except ImportError:
    CLOUDINARY_AVAILABLE = False


# --- AI Libraries Imports (Keep Chroma/SBERT) ---
from chromadb import Client, Settings
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer 

# --- Gemini API Import ---
from google import genai
from google.genai import types as g_types
from google.genai.errors import APIError

# --- Configuration ---
CHROMA_DB_PATH = "./chroma_db_data"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
COLLECTION_NAME = "jobs_and_cvs"
GEMINI_MODEL = "gemini-2.5-flash"

# Global variables for AI resources
chroma_client = None
embedding_model = None
job_cv_collection = None 
gemini_client = None # New Gemini Client

# Initialize FastAPI App
app = FastAPI(
    title="AI Job Platform RAG/Embedding Service",
    description="Backend microservice for CV/JD embeddings, RAG evaluation (Gemini), and KG interaction.",
    version="1.0.0"
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log that environment variables were loaded
config_path = os.path.join(os.path.dirname(__file__), 'config', 'config.env')
if os.path.exists(config_path):
    logger.info(f"Environment variables loaded from {config_path}")
    # Check if Cloudinary credentials are available
    cloud_name = os.getenv("CLOUDINARY_CLIENT_NAME")
    api_key = os.getenv("CLOUDINARY_CLIENT_API")
    api_secret = os.getenv("CLOUDINARY_CLIENT_SECRET")
    if cloud_name and api_key and api_secret:
        logger.info("Cloudinary credentials found in environment")
    else:
        logger.warning("Cloudinary credentials not found in environment variables")

# --- Pydantic Schemas (No change) ---
class CVSubmission(BaseModel):
    resume_url: str
    application_id: str
    job_id: str

class JDSubmission(BaseModel):
    job_id: str
    job_title: str
    job_description: str

class EvaluationRequest(BaseModel):
    job_id: str
    application_id: str
    
class EvaluationResponse(BaseModel):
    relevance_score: float
    personalized_feedback: str

class RecommendationResponse(BaseModel):
    job_ids: List[str]

# --- Chroma/Embedding/KG Initialization (Actual Implementation) ---

@app.on_event("startup")
async def startup_event():
    """Initialize Chroma Client, Embedding Model, Gemini Client, and Cloudinary."""
    global chroma_client, embedding_model, job_cv_collection, gemini_client
    try:
        # 1. Initialize Sentence Transformer
        embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info(f"SentenceTransformer '{EMBEDDING_MODEL_NAME}' loaded.")

        # 2. Initialize Chroma Client (Existing Logic)
        if not os.path.exists(CHROMA_DB_PATH):
             os.makedirs(CHROMA_DB_PATH)
        chroma_client = Client(Settings(persist_directory=CHROMA_DB_PATH))
        
        sbert_ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL_NAME, 
            device="cpu" 
        )
        job_cv_collection = chroma_client.get_or_create_collection(
            name=COLLECTION_NAME, 
            embedding_function=sbert_ef
        )
        logger.info(f"Chroma DB collection '{COLLECTION_NAME}' ready.")
        
        # 3. Initialize Gemini Client
        # Assumes GEMINI_API_KEY is set in the environment
        if os.getenv("GEMINI_API_KEY"):
            gemini_client = genai.Client()
            logger.info("Gemini API Client initialized successfully.")
        else:
            logger.error("GEMINI_API_KEY environment variable not set. Gemini features will fail.")
        
        # 4. Initialize Cloudinary (if credentials available)
        if CLOUDINARY_AVAILABLE:
            cloud_name = os.getenv("CLOUDINARY_CLIENT_NAME")
            api_key = os.getenv("CLOUDINARY_CLIENT_API")
            api_secret = os.getenv("CLOUDINARY_CLIENT_SECRET")
            if cloud_name and api_key and api_secret:
                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret
                )
                logger.info("Cloudinary configured successfully.")
            else:
                logger.warning("Cloudinary credentials not found in environment. Public URL downloads may fail.")
        else:
            logger.warning("Cloudinary Python SDK not installed. Install with: pip install cloudinary")
            
    except Exception as e:
        logger.error(f"Failed to initialize AI resources: {e}")
        # Depending on criticality, you might raise an error here to halt

# --- Helper Functions (Actual Implementation) ---

def download_and_parse_cv(url: str) -> str:
    """
    Downloads a CV (resume) file from a given URL and attempts 
    to extract text. This version is limited to PDF files using pdfplumber.
    
    Supports:
    - Direct PDF URLs
    - Cloudinary URLs
    - Google Drive URLs (converts sharing links to direct download)

    Args:
        url: The public URL of the resume file.

    Returns:
        The extracted plain text content of the CV, or an error message string.

    PREREQUISITES:
    To run this function in a real environment, you must install:
    $ pip install requests pdfplumber
    """
    logger.info(f"Attempting to download CV from: {url}")
    
    # Convert Google Drive sharing URLs to direct download URLs
    if 'drive.google.com' in url:
        logger.info("Detected Google Drive URL, converting to direct download link...")
        # Extract file ID from Google Drive URL
        # Format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        # Or: https://drive.google.com/open?id=FILE_ID
        file_id = None
        if '/file/d/' in url:
            file_id = url.split('/file/d/')[1].split('/')[0]
        elif 'id=' in url:
            file_id = url.split('id=')[1].split('&')[0]
        
        if file_id:
            # Convert to direct download URL (use uc?export=download for direct download)
            url = f"https://drive.google.com/uc?export=download&id={file_id}"
            logger.info(f"Converted Google Drive URL to direct download: {url}")
            # Note: Google Drive may require additional handling for large files
        else:
            logger.warning("Could not extract file ID from Google Drive URL")
            return "ERROR: Invalid Google Drive URL format. Please use a direct PDF URL or a proper Google Drive sharing link."

    # Always use Cloudinary SDK with signed URLs (works for both public and private resources)
    original_url = url
    if 'cloudinary.com' in url and 'upload' in url and CLOUDINARY_AVAILABLE:
        try:
            # Extract public_id from URL
            # URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.pdf
            # Or with folder: https://res.cloudinary.com/{cloud_name}/image/upload/v1/{folder}/{public_id}.pdf
            parts = url.split('/upload/')
            if len(parts) > 1:
                path_part = parts[1].split('?')[0]  # Remove query params
                # Extract version and public_id (may include folder)
                path_parts = path_part.split('/')
                if len(path_parts) >= 2:
                    # Everything after version is the public_id (may include folder path like "resumes/filename")
                    public_id_with_ext = '/'.join(path_parts[1:])  # Everything after version
                    public_id = public_id_with_ext.rsplit('.', 1)[0]  # Remove extension
                    
                    # If public_id starts with folder name, keep it (e.g., "resumes/filename")
                    # Cloudinary API needs the full public_id including folder
                    logger.info(f"Attempting to download via Cloudinary API with public_id: {public_id}")
                    
                    # Use Cloudinary API to get secure URL or download directly
                    try:
                        # Determine resource_type from URL path
                        # Try both raw and image resource types
                        resource = None
                        secure_url = None
                        found_resource_type = None
                        
                        # Try raw first (for PDFs), then image
                        for rt in ["raw", "image"]:
                            try:
                                resource = cloudinary.api.resource(public_id, resource_type=rt)
                                secure_url = resource.get('secure_url') or resource.get('url')
                                if secure_url:
                                    found_resource_type = rt
                                    logger.info(f"Found resource with type '{rt}'")
                                    break
                            except Exception as rt_error:
                                logger.debug(f"Resource type '{rt}' failed: {rt_error}")
                                continue
                        
                        # Always generate a signed URL (works for both public and private resources)
                        # The secure_url from API might not be signed, so always generate a signed one
                        resource_type_to_use = found_resource_type or "image"
                        logger.info(f"Generating signed URL with resource_type '{resource_type_to_use}'...")
                        try:
                            signed_url = cloudinary.utils.cloudinary_url(
                                public_id,
                                resource_type=resource_type_to_use,
                                type="upload",
                                secure=True,
                                sign_url=True  # Always sign the URL for authentication
                            )[0]
                            secure_url = signed_url  # Use the signed URL instead
                            logger.info(f"Generated signed URL: {secure_url}")
                        except Exception as sign_error:
                            logger.warning(f"Failed to generate signed URL: {sign_error}, using original secure_url")
                            # If signing fails, try the original secure_url
                            if not secure_url:
                                # If still no URL, try both types with signed URLs
                                for rt in ["raw", "image"]:
                                    try:
                                        logger.info(f"Generating signed URL with resource_type '{rt}'...")
                                        secure_url = cloudinary.utils.cloudinary_url(
                                            public_id,
                                            resource_type=rt,
                                            type="upload",
                                            secure=True,
                                            sign_url=True
                                        )[0]
                                        found_resource_type = rt
                                        logger.info(f"Generated signed URL: {secure_url}")
                                        break
                                    except Exception as url_error:
                                        logger.debug(f"Failed to generate URL with type '{rt}': {url_error}")
                                        continue
                        
                        if secure_url:
                            logger.info(f"Downloading from Cloudinary URL: {secure_url}")
                            # Try downloading with the secure URL
                            response = requests.get(secure_url, timeout=30, stream=True)
                            if response.status_code == 200:
                                content = response.content
                                logger.info("Successfully downloaded via Cloudinary API")
                                # Skip to PDF parsing
                                if len(content) > 4 and content[:4] == b'%PDF':
                                    file_stream = io.BytesIO(content)
                                    with pdfplumber.open(file_stream) as pdf:
                                        full_text = ""
                                        for page in pdf.pages:
                                            page_text = page.extract_text(x_tolerance=2)
                                            if page_text:
                                                full_text += page_text + "\n--PAGE_BREAK--\n"
                                    
                                    logger.info(f"Successfully extracted text from PDF. Length: {len(full_text)} characters.")
                                    print("\n" + "="*80, flush=True)
                                    print("PDF DATA EXTRACTED:", flush=True)
                                    print("="*80, flush=True)
                                    print(full_text.strip(), flush=True)
                                    print("="*80 + "\n", flush=True)
                                    sys.stdout.flush()
                                    return full_text.strip()
                            elif response.status_code == 401:
                                # Resource is private, try using Cloudinary's authenticated download
                                logger.info("Resource is private, attempting authenticated download...")
                                try:
                                    # Use Cloudinary's authenticated URL generation with signature
                                    signed_url = cloudinary.utils.cloudinary_url(
                                        public_id,
                                        resource_type=found_resource_type or "image",
                                        type="upload",
                                        secure=True,
                                        sign_url=True  # This generates a signed URL with authentication
                                    )[0]
                                    logger.info(f"Generated signed URL: {signed_url}")
                                    
                                    # Try downloading with signed URL
                                    signed_response = requests.get(signed_url, timeout=30, stream=True)
                                    if signed_response.status_code == 200:
                                        content = signed_response.content
                                        logger.info("Successfully downloaded via signed Cloudinary URL")
                                        # Skip to PDF parsing
                                        if len(content) > 4 and content[:4] == b'%PDF':
                                            file_stream = io.BytesIO(content)
                                            with pdfplumber.open(file_stream) as pdf:
                                                full_text = ""
                                                for page in pdf.pages:
                                                    page_text = page.extract_text(x_tolerance=2)
                                                    if page_text:
                                                        full_text += page_text + "\n--PAGE_BREAK--\n"
                                            
                                            logger.info(f"Successfully extracted text from PDF. Length: {len(full_text)} characters.")
                                            print("\n" + "="*80, flush=True)
                                            print("PDF DATA EXTRACTED:", flush=True)
                                            print("="*80, flush=True)
                                            print(full_text.strip(), flush=True)
                                            print("="*80 + "\n", flush=True)
                                            sys.stdout.flush()
                                            return full_text.strip()
                                    else:
                                        logger.warning(f"Signed URL download failed with status {signed_response.status_code}")
                                        raise Exception(f"Failed to download with signed URL: HTTP {signed_response.status_code}")
                                except Exception as signed_error:
                                    logger.warning(f"Signed URL generation/download failed: {signed_error}")
                                    raise Exception(f"Failed to download: HTTP {response.status_code}")
                            else:
                                logger.warning(f"Download from Cloudinary URL failed with status {response.status_code}")
                                raise Exception(f"Failed to download: HTTP {response.status_code}")
                        else:
                            raise Exception("Could not generate Cloudinary URL")
                    except Exception as cloudinary_error:
                        logger.warning(f"Cloudinary API download failed: {cloudinary_error}, falling back to direct URL...")
        except Exception as e:
            logger.warning(f"Failed to extract public_id from Cloudinary URL: {e}, trying direct download...")

    # 2. Handle Cloudinary URLs - try multiple formats
    if 'cloudinary.com' in url and 'upload' in url:
        # Remove any existing query parameters that might cause issues
        base_url = url.split('?')[0]
        
        # Try different Cloudinary URL formats
        # Format 1: Direct raw URL (remove /image/ and use /raw/)
        if '/image/upload/' in base_url:
            raw_url = base_url.replace('/image/upload/', '/raw/upload/')
            logger.info(f"Trying Cloudinary raw URL format: {raw_url}")
        else:
            raw_url = None
        
        # Format 2: Original URL without query params
        clean_url = base_url
        
        # Try URLs in order: raw format, clean format, original
        urls_to_try = []
        if raw_url:
            urls_to_try.append(raw_url)
        urls_to_try.append(clean_url)
        urls_to_try.append(original_url)
    else:
        urls_to_try = [url]

    # 2. Download the file content - try multiple URL formats if Cloudinary
    response = None
    last_error = None
    
    for attempt_url in urls_to_try:
        try:
            logger.info(f"Attempting download from: {attempt_url}")
            # Use a timeout for robust network calls
            # Add headers to mimic a browser request
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/pdf,application/octet-stream,*/*',
                'Accept-Language': 'en-US,en;q=0.9'
            }
            # Only add Referer for Cloudinary URLs
            if 'cloudinary.com' in attempt_url:
                headers['Referer'] = 'https://cloudinary.com/'
            elif 'drive.google.com' in attempt_url:
                headers['Referer'] = 'https://drive.google.com/'
            # For Google Drive, try both methods
            if 'drive.google.com' in attempt_url and 'id=' in attempt_url:
                file_id = attempt_url.split('id=')[1].split('&')[0]
                # Try with confirm parameter first (for large files)
                alt_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
                logger.info(f"Trying Google Drive with confirm parameter: {alt_url}")
                response = requests.get(alt_url, headers=headers, timeout=30, allow_redirects=True, stream=True)
            else:
                response = requests.get(attempt_url, headers=headers, timeout=30, allow_redirects=True, stream=True)
            
            # Check if we got a successful response
            if response.status_code == 200:
                logger.info(f"Successfully downloaded from: {attempt_url}")
                break
            elif response.status_code == 401:
                logger.warning(f"401 Unauthorized for {attempt_url}, trying next format...")
                response = None
                continue
            else:
                response.raise_for_status()
                
        except requests.exceptions.RequestException as e:
            logger.warning(f"Failed to download from {attempt_url}: {e}")
            last_error = e
            response = None
            continue
    
    if response is None or response.status_code != 200:
        error_msg = last_error if last_error else "All URL formats failed"
        logger.error(f"Failed to download the CV from URL {original_url}: {error_msg}")
        return f"ERROR: Download failed. {error_msg}"
    
    # Get the content
    try:
        content = response.content
    except Exception as e:
        logger.error(f"Failed to read response content: {e}")
        return f"ERROR: Failed to read response content. {e}"

    # 3. Verify content type after download
    content_type = response.headers.get('Content-Type', '').lower()
    
    # First, check the actual file content (magic bytes) - most reliable
    is_pdf = False
    if len(content) > 4:
        is_pdf = content[:4] == b'%PDF'
        if is_pdf:
            logger.info("PDF detected by magic bytes (%PDF)")
    
    # If not detected by magic bytes, check content type and URL
    if not is_pdf:
        is_pdf = 'pdf' in content_type
        if is_pdf:
            logger.info(f"PDF detected by Content-Type: {content_type}")
    
    if not is_pdf:
        is_pdf = original_url.lower().endswith('.pdf')
        if is_pdf:
            logger.info("PDF detected by URL extension")

    if is_pdf:
        logger.info("Content confirmed as PDF. Using pdfplumber for extraction.")

        # Use io.BytesIO to treat the raw bytes content as an in-memory file
        file_stream = io.BytesIO(content)

        try:
            # pdfplumber is excellent for structured PDF text extraction
            with pdfplumber.open(file_stream) as pdf:
                full_text = ""
                for page in pdf.pages:
                    # Extract text and add a separator to denote page breaks
                    page_text = page.extract_text(x_tolerance=2)
                    if page_text:
                        full_text += page_text + "\n--PAGE_BREAK--\n"

            logger.info(f"Successfully extracted text from PDF. Length: {len(full_text)} characters.")
            
            # Log the PDF data to console
            print("\n" + "="*80, flush=True)
            print("PDF DATA EXTRACTED:", flush=True)
            print("="*80, flush=True)
            print(full_text.strip(), flush=True)
            print("="*80 + "\n", flush=True)
            sys.stdout.flush()
            
            return full_text.strip()

        except Exception as e:
            logger.error(f"Failed to parse PDF content using pdfplumber: {e}")
            return f"ERROR: PDF parsing failed. {e}"
    
    else:
        # This fallback catches cases where the content type was misleading
        logger.warning(f"File is not a PDF (Content-Type: {content_type}). Cannot extract text.")
        return "ERROR: Only PDF files are supported for extraction in this function."


def extract_skills_and_link_kg(text: str, entity_id: str, entity_type: str) -> List[str]:
    """
    Extracts skills from CV or JD text using Gemini LLM.
    """
    if gemini_client is None:
        raise RuntimeError("Gemini client is not initialized.")
    
    logger.info(f"Extracting skills from {entity_type}: {entity_id} using Gemini")
    
    if not text or len(text.strip()) == 0:
        logger.warning(f"Empty text provided for {entity_type} {entity_id}")
        return []
    
    # Create prompt for Gemini to extract skills
    system_instruction = (
        "You are an expert resume parser. Your ONLY task is to extract SKILLS from the provided text. "
        "SKILLS are technical abilities, programming languages, software tools, frameworks, methodologies, or soft skills. "
        "DO NOT extract: job titles, company names, university names, degrees, certifications, project names, "
        "personal information, dates, locations, or any other non-skill information. "
        "Return ONLY a JSON object with a 'skills' key containing a list of skill names. "
        "Each skill should be a single, clear skill name (e.g., 'Python', 'React', 'Project Management', 'Communication'). "
        "Do not include any text outside the JSON object."
    )
    
    prompt = f"""
    Extract ONLY skills from the following {entity_type.upper()} text. 
    
    IMPORTANT: Extract ONLY technical skills (programming languages, tools, frameworks, technologies) and soft skills (communication, leadership, etc.).
    DO NOT extract: job titles, company names, education details, certifications, project names, personal info, dates, or locations.
    
    Text:
    {text}
    
    Return a JSON object with ONLY a 'skills' array containing the extracted skills. Example format:
    {{"skills": ["Python", "JavaScript", "React", "Project Management"]}}
    """
    
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[g_types.Content(role="user", parts=[g_types.Part.from_text(prompt)])],
            config=g_types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
            )
        )
        
        if not response.text:
            raise ValueError("Gemini returned an empty response.")
        
        json_output = json.loads(response.text)
        skills = json_output.get('skills', [])
        
        if not isinstance(skills, list):
            logger.warning(f"Gemini returned skills in unexpected format: {skills}")
            skills = []
        
        # Clean and deduplicate skills
        unique_skills = []
        seen = set()
        for skill in skills:
            if isinstance(skill, str):
                skill_clean = skill.strip()
                if skill_clean and skill_clean.lower() not in seen:
                    unique_skills.append(skill_clean)
                    seen.add(skill_clean.lower())
        
        logger.info(f"Extracted {len(unique_skills)} skills from {entity_type}: {unique_skills}")
        
        # Log the skills to console
        print("\n" + "="*80, flush=True)
        print(f"SKILLS EXTRACTED ({entity_type.upper()} - {entity_id}):", flush=True)
        print("="*80, flush=True)
        if unique_skills:
            for i, skill in enumerate(unique_skills, 1):
                print(f"{i}. {skill}", flush=True)
        else:
            print("No skills found.", flush=True)
        print("="*80 + "\n", flush=True)
        sys.stdout.flush()
        
        return unique_skills
        
    except APIError as e:
        logger.error(f"Gemini API Error during skill extraction: {e}")
        return []
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse Gemini response for skill extraction: {e}. Raw response: {response.text if 'response' in locals() else 'N/A'}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error during skill extraction: {e}")
        return []

def save_to_vector_store(entity_id: str, text_content: str, metadata: Dict[str, Any]):
    """
    Saves the document, embedding (generated by Chroma's EF), and metadata to Chroma DB.
    """
    if job_cv_collection is None:
        raise RuntimeError("Chroma DB collection is not initialized.")
        
    try:
        # Convert metadata values to Chroma-compatible types (strings, ints, floats, bools only)
        # Chroma doesn't support lists in metadata, so convert lists to comma-separated strings
        cleaned_metadata = {}
        for key, value in metadata.items():
            if isinstance(value, list):
                # Convert list to comma-separated string
                cleaned_metadata[key] = ", ".join(str(v) for v in value)
            elif isinstance(value, (str, int, float, bool)) or value is None:
                cleaned_metadata[key] = value
            else:
                # Convert other types to string
                cleaned_metadata[key] = str(value)
        
        # Use upsert to handle updates if the ID already exists
        job_cv_collection.upsert(
            documents=[text_content],
            metadatas=[cleaned_metadata],
            ids=[entity_id]
        )
        logger.info(f"Successfully saved/updated entity {entity_id} to Chroma DB.")
    except Exception as e:
        logger.error(f"Failed to save to Chroma DB: {e}")
        raise

def rag_pipeline_score(job_id: str, application_id: str) -> EvaluationResponse:
    """
    The core RAG pipeline: retrieves context from Chroma DB and calls Gemini for scoring/feedback.
    """
    if job_cv_collection is None or gemini_client is None:
        raise RuntimeError("AI resources are not initialized.")

    logger.info(f"Starting RAG pipeline for Job {job_id} and App {application_id} using Gemini.")
    
    # 1. Retrieve JD and CV text/metadata from Chroma
    result = job_cv_collection.get(ids=[job_id, application_id], include=['documents', 'metadatas'])
    
    if len(result['documents']) < 2:
        raise HTTPException(status_code=404, detail="Job or Application not found in Vector Store.")
        
    jd_doc = result['documents'][result['ids'].index(job_id)]
    cv_doc = result['documents'][result['ids'].index(application_id)]
    
    jd_metadata = result['metadatas'][result['ids'].index(job_id)]
    cv_metadata = result['metadatas'][result['ids'].index(application_id)]

    # 2. Construct the RAG Prompt for Gemini
    # KG Context: We assume the skills are derived from the KG via the metadata
    # Skills are stored as comma-separated strings in Chroma metadata
    jd_skills = jd_metadata.get('skills', '')
    cv_skills = cv_metadata.get('skills', '')
    
    # Handle both string and list formats (for backward compatibility)
    if isinstance(jd_skills, list):
        kg_context_jd = ", ".join(jd_skills)
    else:
        kg_context_jd = jd_skills if jd_skills else ""
    
    if isinstance(cv_skills, list):
        kg_context_cv = ", ".join(cv_skills)
    else:
        kg_context_cv = cv_skills if cv_skills else ""

    system_instruction = (
        "You are an expert HR AI analyst. Your task is to compare a candidate's CV against a Job Description "
        "and provide a relevance score (0-100) and personalized feedback. "
        "Analyze the provided text and extracted skills. Focus on technical alignment and potential growth areas. "
        "Your output MUST be a valid JSON object with the keys 'relevance_score' (integer) and 'personalized_feedback' (string). "
        "Do not include any text outside the JSON object."
    )

    prompt = f"""
    --- Job Description (JD) ---
    Title: {jd_metadata.get('title', 'N/A')}
    Required Skills (KG Context): {kg_context_jd}
    Full Description: {jd_doc}

    --- Candidate CV ---
    Skills Found (KG Context): {kg_context_cv}
    Relevant CV Content: {cv_doc}

    --- Task ---
    Generate the JSON object comparing the candidate to the job.
    """
    
    # 3. Call the Gemini API
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[g_types.Content(role="user", parts=[g_types.Part.from_text(prompt)])],
            config=g_types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json", # Request JSON output
            )
        )
        
        # 4. Parse the JSON Output
        if not response.text:
            raise ValueError("Gemini returned an empty response.")
            
        json_output = json.loads(response.text)
        
        score = int(json_output.get('relevance_score'))
        feedback = json_output.get('personalized_feedback')

        if score is None or feedback is None:
             raise ValueError(f"Gemini returned invalid JSON structure: {response.text}")
             
        return EvaluationResponse(relevance_score=score, personalized_feedback=feedback)

    except APIError as e:
        logger.error(f"Gemini API Error: {e}")
        raise HTTPException(status_code=503, detail=f"Gemini API failed during evaluation: {e}")
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse Gemini response or validation failed: {e}. Raw response: {response.text}")
        raise HTTPException(status_code=500, detail="AI evaluation failed due to invalid response from Gemini.")
    except Exception as e:
        logger.error(f"Unexpected error during RAG: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during RAG evaluation.")

@app.get("/rag/recommendations/{application_id}", response_model=RecommendationResponse)
async def get_job_recommendations(application_id: str):
    """
    Generates personalized job recommendations based on the user's latest CV embedding.
    NOTE: The Node.js layer is responsible for providing the correct application_id.
    """
    if job_cv_collection is None:
        raise HTTPException(status_code=503, detail="AI Service is initializing.")
        
    try:
        # 1. Retrieve the user's latest CV vector from Chroma DB
        cv_result = job_cv_collection.get(ids=[application_id], include=['embeddings'])
        if not cv_result['embeddings']:
            raise HTTPException(status_code=404, detail=f"Application ID '{application_id}' not found in Vector Store.")
            
        query_vector = cv_result['embeddings'][0]
        
        # 2. Query Chroma DB for similar Job Description vectors (filter by type: 'jd')
        results = job_cv_collection.query(
            query_embeddings=[query_vector],
            n_results=5,
            where={"type": "jd"}, # Only recommend jobs
            include=['metadatas']
        )
        
        # 3. Extract Job IDs (which are the document IDs/MongoDB IDs)
        job_ids = results['ids'][0]
        
        logger.info(f"Found {len(job_ids)} job recommendations for application {application_id} via vector similarity.")
        
        return RecommendationResponse(job_ids=job_ids)
    except Exception as e:
        logger.error(f"Error during job recommendation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during job recommendation.")

# --- Endpoints (No functional change) ---

@app.post("/process/cv-submission")
async def process_cv_submission(data: CVSubmission):
    # ... (Logic remains the same, but calls are now to implemented helper functions)
    try:
        cv_text = download_and_parse_cv(data.resume_url)
        skills = extract_skills_and_link_kg(cv_text, data.application_id, 'cv')
        
        save_to_vector_store(
            data.application_id, 
            cv_text,
            {"type": "cv", "skills": skills, "job_id": data.job_id}
        )
        return {"status": "success", "message": "CV processing and embedding successful."}
    except Exception as e:
        logger.error(f"Error in CV submission: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during CV processing: {e}")


@app.post("/process/jd-submission")
async def process_jd_submission(data: JDSubmission):
    # ... (Logic remains the same, but calls are now to implemented helper functions)
    try:
        skills = extract_skills_and_link_kg(data.job_description, data.job_id, 'jd')
        
        save_to_vector_store(
            data.job_id, 
            data.job_description,
            {"type": "jd", "skills": skills, "title": data.job_title}
        )
        return {"status": "success", "message": "JD processing and embedding successful."}
    except Exception as e:
        logger.error(f"Error in JD submission: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error during JD processing: {e}")

@app.post("/rag/evaluate-candidate", response_model=EvaluationResponse)
async def evaluate_candidate(data: EvaluationRequest):
    # ... (Calls the implemented rag_pipeline_score)
    try:
        evaluation = rag_pipeline_score(data.job_id, data.application_id)
        return evaluation
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during RAG evaluation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during RAG evaluation.")


@app.get("/")
async def root():
    return {"message": "AI Job Platform FastAPI Service is running."}

@app.get("/test/cv-download")
async def test_cv_download(url: str):
    """
    Test endpoint to test the download_and_parse_cv function with any URL.
    
    Usage: GET /test/cv-download?url=<your_url>
    
    Example:
    http://localhost:8000/test/cv-download?url=https://res.cloudinary.com/djkkder2z/image/upload/v1762960615/ubqd3m5j0ndfjce08rqn.pdf
    """
    try:
        result = download_and_parse_cv(url)
        
        if result.startswith("ERROR:"):
            return {
                "success": False,
                "error": result,
                "url": url
            }
        else:
            return {
                "success": True,
                "url": url,
                "extracted_text_length": len(result),
                "extracted_text_preview": result[:500] + "..." if len(result) > 500 else result,
                "full_text": result
            }
    except Exception as e:
        logger.error(f"Test CV download failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "url": url
        }

@app.get("/test/cv-download-and-extract-skills")
async def test_cv_download_and_extract_skills(url: str):
    """
    Test endpoint to test both CV download and skill extraction.
    
    Usage: GET /test/cv-download-and-extract-skills?url=<your_url>
    
    Example:
    http://localhost:8000/test/cv-download-and-extract-skills?url=https://res.cloudinary.com/djkkder2z/image/upload/v1762960615/ubqd3m5j0ndfjce08rqn.pdf
    """
    try:
        # Step 1: Download and parse CV
        logger.info(f"Testing CV download from: {url}")
        cv_text = download_and_parse_cv(url)
        
        if cv_text.startswith("ERROR:"):
            return {
                "success": False,
                "step": "download",
                "error": cv_text,
                "url": url
            }
        
        # Step 2: Extract skills using Gemini
        logger.info("Testing skill extraction from downloaded CV text")
        test_entity_id = "test_" + str(int(time.time()))
        skills = extract_skills_and_link_kg(cv_text, test_entity_id, 'cv')
        
        return {
            "success": True,
            "url": url,
            "download": {
                "success": True,
                "extracted_text_length": len(cv_text),
                "extracted_text_preview": cv_text[:500] + "..." if len(cv_text) > 500 else cv_text
            },
            "skill_extraction": {
                "success": True,
                "skills_count": len(skills),
                "skills": skills
            }
        }
        
    except RuntimeError as e:
        if "Gemini client" in str(e):
            return {
                "success": False,
                "step": "skill_extraction",
                "error": "Gemini client is not initialized. Make sure the FastAPI service has started properly.",
                "url": url
            }
        else:
            return {
                "success": False,
                "step": "unknown",
                "error": str(e),
                "url": url
            }
    except Exception as e:
        logger.error(f"Test CV download and skill extraction failed: {e}")
        return {
            "success": False,
            "step": "unknown",
            "error": str(e),
            "url": url
        }