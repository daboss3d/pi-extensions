# will create a symlink to all files in this directory to `~/pi-extensions`

#   mkdir -p /path/to/destination#

DEST_DIR="$HOME/pi-extensions"
for file in ~/code/foss/pi-extensions/dev/*; do
  [ -f "$file" ] && ln -s "$(realpath "$file")" $DEST_DIR
done
