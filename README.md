Heroku Source Deployer
======================

User Info
---------

Deploy a source directory to Heroku:

    var herokuSourceDeployer = require('heroku-source-deployer');
    herokuSourceDeployer.deployDir(apiToken, appName, dir);

Deploy a Buffer containing a tgz of a source directory to Heroku:

    var herokuSourceDeployer = require('heroku-source-deployer');
    herokuSourceDeployer.deploy(apiToken, appName, buffer);


Developer Info
--------------

Release:

1. `git tag v0.0.x`
1. `git push --tags`
1. `npm publish`
1. bump version in `package.json`