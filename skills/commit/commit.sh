#!/bin/bash
#
# Helper script for creating conventional commits
# Usage: ./commit.sh <type> <scope> <subject> [body]
#

set -e

TYPE=$1
SCOPE=$2
SUBJECT=$3
BODY=$4

if [ -z "$TYPE" ] || [ -z "$SUBJECT" ]; then
    echo "Usage: ./commit.sh <type> <scope> <subject> [body]"
    echo ""
    echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    echo ""
    echo "Example: ./commit.sh feat auth 'add login button' 'Implements Google OAuth'"
    exit 1
fi

# Format the commit message
if [ -n "$SCOPE" ]; then
    MESSAGE="$TYPE($SCOPE): $SUBJECT"
else
    MESSAGE="$TYPE: $SUBJECT"
fi

# Execute the commit
if [ -n "$BODY" ]; then
    git commit -m "$MESSAGE" -m "$BODY"
else
    git commit -m "$MESSAGE"
fi

echo "Committed: $MESSAGE"