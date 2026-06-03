#!/usr/bin/env python3
"""Run the subreready FastAPI server locally."""

import subprocess
import sys

def main():
    print("Starting subreready server...")
    print("Press Ctrl+C to stop the server.")
    print()
    
    # Run uvicorn to start the FastAPI server
    result = subprocess.run([
        sys.executable, "-m", "uvicorn",
        "index:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload"
    ])
    
    sys.exit(result.returncode)

if __name__ == "__main__":
    main()

