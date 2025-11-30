#!/bin/bash

# Add .jpg extension to UUID-named JPEG files without extensions
# Usage: ./add-jpg-extension.sh <folder>
#
# This script finds files that:
# - Have a UUID filename (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
# - Have no file extension
# - Are actually JPEG files (based on file magic)
# And renames them to have a .jpg extension

if [ -z "$1" ]; then
    echo "Usage: $0 <folder>"
    echo "Example: $0 ~/Desktop/my-export"
    exit 1
fi

FOLDER="$1"

if [ ! -d "$FOLDER" ]; then
    echo "Error: '$FOLDER' is not a directory"
    exit 1
fi

# UUID regex pattern (case insensitive)
UUID_PATTERN='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

COUNT=0

# Find all files recursively
find "$FOLDER" -type f | while read -r filepath; do
    filename=$(basename "$filepath")

    # Check if filename matches UUID pattern (no extension)
    if [[ "$filename" =~ $UUID_PATTERN ]]; then
        # Check if file is a JPEG using 'file' command
        filetype=$(file -b --mime-type "$filepath")

        if [ "$filetype" = "image/jpeg" ]; then
            newpath="${filepath}.jpg"
            echo "Renaming: $filepath -> $newpath"
            mv "$filepath" "$newpath"
            ((COUNT++))
        fi
    fi
done

echo ""
echo "Done! Renamed files to have .jpg extension."
