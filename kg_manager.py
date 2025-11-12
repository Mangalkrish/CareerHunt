import pandas as pd
import networkx as nx
from node2vec import Node2Vec
import numpy as np
import json
import schedule
import time
import os
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
CSV_FILE_PATH = "jobs.csv"  # Consistent file path
KG_FILE = "careerhunt_kg.gpickle"
EMBEDDINGS_FILE = "embeddings.json"
NEW_NODES_FILE = "new_nodes_log.json"

# Load KG & embeddings if exist
try:
    if os.path.exists(KG_FILE) and os.path.exists(EMBEDDINGS_FILE):
        G = nx.read_gpickle(KG_FILE)
        with open(EMBEDDINGS_FILE, "r") as f:
            embeddings = json.load(f)
        logger.info(f"Loaded existing KG with {len(G.nodes())} nodes and {len(G.edges())} edges.")
    else:
        G = nx.Graph()
        embeddings = {}
        logger.info("No existing KG found. Starting fresh.")
except Exception as e:
    logger.error(f"Error loading existing KG: {e}")
    G = nx.Graph()
    embeddings = {}

# Track new nodes file
if not os.path.exists(NEW_NODES_FILE):
    with open(NEW_NODES_FILE, "w") as f:
        json.dump([], f)

def log_new_node(node_name, node_type):
    """Log added nodes so retrain knows what was added today."""
    try:
        with open(NEW_NODES_FILE, "r") as f:
            log = json.load(f)
        log.append({"node": node_name, "type": node_type, "timestamp": time.time()})
        with open(NEW_NODES_FILE, "w") as f:
            json.dump(log, f, indent=2)
    except Exception as e:
        logger.error(f"Error logging new node: {e}")

def validate_csv_structure(csv_path):
    """Validate that the CSV file has the required structure."""
    try:
        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"CSV file not found: {csv_path}")
        
        jobs = pd.read_csv(csv_path)
        required_columns = ['job_id', 'title', 'company', 'required_skills']
        missing_columns = [col for col in required_columns if col not in jobs.columns]
        
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")
        
        if len(jobs) == 0:
            raise ValueError("CSV file is empty")
        
        logger.info(f"CSV validation passed: {len(jobs)} jobs found")
        return jobs
    except Exception as e:
        logger.error(f"CSV validation failed: {e}")
        raise

def add_node_with_neighbors(node_name, node_type, neighbors):
    """
    Add a new node (job, skill, or company) with proper connections and approximate embeddings.
    Ensures the node is correctly placed in the KG.
    """
    try:
        # Validate node_type
        if node_type not in ["job", "skill", "company"]:
            raise ValueError(f"Invalid node type: {node_type}")

        # Add node
        G.add_node(node_name, type=node_type)

        # Ensure neighbors exist or create them as needed
        for n in neighbors:
            if n not in G:
                # Infer type from prefix (job_ / skill_ / company_)
                if n.startswith("job_"):
                    G.add_node(n, type="job")
                elif n.startswith("skill_"):
                    G.add_node(n, type="skill")
                elif n.startswith("company_"):
                    G.add_node(n, type="company")
                else:
                    logger.warning(f"Could not infer type for neighbor: {n}")
                    continue
            G.add_edge(node_name, n)

        # Build approximate embedding
        valid_neighbors = [n for n in neighbors if n in embeddings]
        if valid_neighbors:
            neighbor_vecs = np.array([embeddings[n] for n in valid_neighbors])
            avg_vec = neighbor_vecs.mean(axis=0)
            embeddings[node_name] = avg_vec.tolist()
        else:
            embeddings[node_name] = np.random.normal(scale=0.01, size=32).tolist()

        # Log for nightly retrain
        log_new_node(node_name, node_type)

        # Save updated KG and embeddings
        nx.write_gpickle(G, KG_FILE)
        with open(EMBEDDINGS_FILE, "w") as f:
            json.dump(embeddings, f, indent=2)

        logger.info(f"[Realtime Update] Added '{node_name}' ({node_type}) connected to {neighbors}.")
        return True
        
    except Exception as e:
        logger.error(f"Error adding node {node_name}: {e}")
        return False

def nightly_retrain():
    """Perform nightly retrain of the entire knowledge graph."""
    logger.info("\n[Nightly Retrain] Starting full KG rebuild...")
    
    try:
        # Validate and load CSV
        jobs = validate_csv_structure(CSV_FILE_PATH)
        
        # Build new graph
        G_new = nx.Graph()
        for _, row in jobs.iterrows():
            job_node = f"job_{row['job_id']}"
            company_node = f"company_{row['company']}"
            
            G_new.add_node(job_node, type="job", title=row["title"], company=row["company"])
            G_new.add_node(company_node, type="company", name=row["company"])
            G_new.add_edge(job_node, company_node, relation="POSTED_BY")

            # Handle skills with proper validation
            if pd.notna(row["required_skills"]):
                for skill in row["required_skills"].split(","):
                    skill = skill.strip()
                    if skill:  # Only add non-empty skills
                        skill_node = f"skill_{skill}"
                        G_new.add_node(skill_node, type="skill", name=skill)
                        G_new.add_edge(job_node, skill_node, relation="REQUIRES_SKILL")

        logger.info(f"Rebuilt KG: {G_new.number_of_nodes()} nodes, {G_new.number_of_edges()} edges.")

        # Train new embeddings
        try:
            node2vec = Node2Vec(G_new, dimensions=32, walk_length=20, num_walks=50, workers=1, quiet=True)
            model = node2vec.fit(window=5, min_count=1)
            new_embeddings = {node: model.wv[node].tolist() for node in G_new.nodes()}
            logger.info("Node2Vec embeddings trained successfully")
        except Exception as e:
            logger.warning(f"Node2Vec training failed, using random embeddings: {e}")
            new_embeddings = {node: np.random.normal(scale=0.01, size=32).tolist() for node in G_new.nodes()}

        # Save new KG and embeddings
        nx.write_gpickle(G_new, KG_FILE)
        with open(EMBEDDINGS_FILE, "w") as f:
            json.dump(new_embeddings, f, indent=2)

        # Update global variables
        global G, embeddings
        G, embeddings = G_new, new_embeddings

        # Clear new nodes log
        with open(NEW_NODES_FILE, "w") as f:
            json.dump([], f)

        logger.info("[Nightly Retrain] Complete. KG & embeddings refreshed!\n")
        return True
        
    except Exception as e:
        logger.error(f"[Nightly Retrain] Failed: {e}")
        return False

def start_scheduler():
    """Start the scheduled nightly retrain."""
    schedule.every().day.at("01:23").do(nightly_retrain)
    logger.info("KG Manager running. Realtime updates enabled. Full retrain scheduled at 01:23 AM.")

def run_scheduler():
    """Run the scheduler loop."""
    while True:
        try:
            schedule.run_pending()
            time.sleep(60)
        except KeyboardInterrupt:
            logger.info("Scheduler stopped by user")
            break
        except Exception as e:
            logger.error(f"Scheduler error: {e}")
            time.sleep(60)  # Wait before retrying

if __name__ == "__main__":
    start_scheduler()
    run_scheduler()
