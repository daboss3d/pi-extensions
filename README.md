# pi-extensions
Extensions for Pi Agent


## Install
pi install npm:@daboss3d/<package-name>
See each package's README for setup and usage.


#### update packages that have been updated

Packages like 'pi-reviewer' and 'plannotator' are updated manually

```bash
   cd /home/daboss/code/foss/pi-extensions

   # Remove old copy
   rm -rf packages/<name>

   # Clone fresh (shallow to keep it small)
   git clone --depth 1 <repo-url> packages/<name>
   git clone --depth 1 https://github.com/backnotprop/plannotator.git plannotator

   # Strip .git so it stays a regular directory
   rm -rf packages/<name>/.git

   # Commit
   git add -A packages/<name>
   git commit -m "Update <name>"
```




