import sys
import os
sys.path.append(os.getcwd())

import asyncio
from app.fast_api_app import pre_warm_distilled_regulation, get_compliance_bucket

async def main():
    print("Deleting old bad cache...")
    bucket = get_compliance_bucket()
    blob = bucket.blob("global_cache/cache/regulations/CELEX:32024R1689_distilled.md")
    if blob.exists():
        blob.delete()
        
    print("Running pre-warm script manually...")
    await pre_warm_distilled_regulation()
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
