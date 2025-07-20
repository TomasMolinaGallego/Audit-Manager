
## Para el tribunal del TFM

El funcionamiento de este plugin se puede encontrar en mi página personal de Atlassian Jira: https://tomasmolinaumu.atlassian.net/jira/apps/ecf2ed54-2ec3-47cc-ac9e-f76a37d435e1/e188bea0-5b01-4635-bda6-fcc4db37df25/home

Los catálogos de prueba están incluidos en la carpeta catalogs, son csv donde solo se necesita copiar y pegar
# Forge Hello World

This project contains a Forge app written in Javascript that displays `Hello World!` in a Jira admin page. 

See [developer.atlassian.com/platform/forge/](https://developer.atlassian.com/platform/forge) for documentation and tutorials explaining Forge.

## Requirements

See [Set up Forge](https://developer.atlassian.com/platform/forge/set-up-forge/) for instructions to get set up.

## Quick start

- Modify your app frontend by editing the `src/frontend/index.jsx` file.

- Modify your app backend by editing the `src/resolvers/index.js` file to define resolver functions. See [Forge resolvers](https://developer.atlassian.com/platform/forge/runtime-reference/custom-ui-resolver/) for documentation on resolver functions.

- Build and deploy your app by running:
```
forge deploy
```

- Install your app in an Atlassian site by running:
```
forge install
```

- Develop your app by running `forge tunnel` to proxy invocations locally:
```
forge tunnel
```

### Notes
- Use the `forge deploy` command when you want to persist code changes.
- Use the `forge install` command when you want to install the app on a new site.
- Once the app is installed on a site, the site picks up the new app changes you deploy without needing to rerun the install command.

