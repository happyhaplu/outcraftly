#!/bin/bash

# Coolify Application Setup Script
# This script automates the deployment setup via Coolify API

set -e

COOLIFY_URL="http://155.133.26.49:8000"
COOLIFY_TOKEN=""

echo "🚀 Coolify Application Setup"
echo "=============================="
echo ""
echo "First, we need to get your Coolify API token:"
echo "1. Go to: ${COOLIFY_URL}/security/api-tokens"
echo "2. Click 'Create New Token'"
echo "3. Give it a name: 'Deployment Setup'"
echo "4. Copy the token"
echo ""
read -p "Paste your Coolify API token here: " COOLIFY_TOKEN

if [ -z "$COOLIFY_TOKEN" ]; then
    echo "❌ Error: API token is required"
    exit 1
fi

echo ""
echo "Great! Now I'll set up your applications..."
echo ""

# Get project ID
echo "📋 Fetching project information..."
PROJECT_RESPONSE=$(curl -s -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    "${COOLIFY_URL}/api/v1/projects")

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.data[0].uuid' 2>/dev/null)

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    echo "❌ Could not find project. Please ensure you created 'Outcraftly' project in the UI first."
    exit 1
fi

echo "✅ Found project: $PROJECT_ID"

# Get environment ID (production)
ENV_RESPONSE=$(curl -s -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    "${COOLIFY_URL}/api/v1/projects/${PROJECT_ID}/environments")

PROD_ENV_ID=$(echo $ENV_RESPONSE | jq -r '.data[] | select(.name == "production") | .uuid' 2>/dev/null)

if [ -z "$PROD_ENV_ID" ] || [ "$PROD_ENV_ID" = "null" ]; then
    echo "❌ Production environment not found"
    exit 1
fi

echo "✅ Found production environment: $PROD_ENV_ID"

# Create staging environment if it doesn't exist
STAGING_ENV_ID=$(echo $ENV_RESPONSE | jq -r '.data[] | select(.name == "staging") | .uuid' 2>/dev/null)

if [ -z "$STAGING_ENV_ID" ] || [ "$STAGING_ENV_ID" = "null" ]; then
    echo "📝 Creating staging environment..."
    STAGING_CREATE=$(curl -s -X POST \
        -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"staging\", \"project_uuid\": \"${PROJECT_ID}\"}" \
        "${COOLIFY_URL}/api/v1/projects/${PROJECT_ID}/environments")
    
    STAGING_ENV_ID=$(echo $STAGING_CREATE | jq -r '.uuid' 2>/dev/null)
    echo "✅ Created staging environment: $STAGING_ENV_ID"
else
    echo "✅ Found staging environment: $STAGING_ENV_ID"
fi

echo ""
echo "==========================================="
echo "✅ Setup Complete!"
echo "==========================================="
echo ""
echo "📝 Next Steps (Manual - requires web UI):"
echo ""
echo "1. Connect GitHub Source:"
echo "   - Go to: ${COOLIFY_URL}/sources"
echo "   - Click 'Add Source' → 'GitHub'"
echo "   - Authorize Coolify with GitHub"
echo "   - Grant access to 'happyhaplu/outcraftly'"
echo ""
echo "2. Deploy Staging Application:"
echo "   - Go to: ${COOLIFY_URL}/project/${PROJECT_ID}/environment/${STAGING_ENV_ID}"
echo "   - Click 'New Resource' → 'Application'"
echo "   - Select: GitHub source → happyhaplu/outcraftly"
echo "   - Branch: main"
echo "   - Build Pack: nixpacks"
echo "   - Domain: staging.outcraftly.com"
echo "   - Port: 3000"
echo "   - Add environment variables (all your secrets)"
echo "   - Click 'Deploy'"
echo ""
echo "3. Deploy Production Application:"
echo "   - Go to: ${COOLIFY_URL}/project/${PROJECT_ID}/environment/${PROD_ENV_ID}"
echo "   - Same steps but with:"
echo "     - Branch: release"
echo "     - Domain: app.outcraftly.com"
echo ""
echo "Project ID: ${PROJECT_ID}"
echo "Staging Environment ID: ${STAGING_ENV_ID}"
echo "Production Environment ID: ${PROD_ENV_ID}"
echo ""
