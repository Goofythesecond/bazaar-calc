# Data inbox

Upload your collector's `.json.gz` files here (**Add file > Upload files**, then **Create a new branch and start a pull
request**). Files must be named the way the collector names them: `<your GitHub login>_<UTC start>.json.gz`, at most
25 MB each.

An automatic check opens every file, verifies it and compares it with other recordings of the same time. After the
maintainer merges the pull request, the files are moved to `data/contrib/<login>/` and the website is rebuilt with them.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for how to record data.
