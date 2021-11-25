const webpack = require("webpack")
const { isMatch } = require("./util")
const readYaml = require('read-yaml');
const fs = require('fs');

function flattenMessages(nestedMessages, prefix = "") {
  return Object.keys(nestedMessages).reduce((messages, key) => {
    let value = nestedMessages[key]
    let prefixedKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === "string") {
      messages[prefixedKey] = value
    } else {
      Object.assign(messages, flattenMessages(value, prefixedKey))
    }

    return messages
  }, {})
}

exports.onCreateWebpackConfig = ({ actions, plugins }, pluginOptions) => {
  const { redirectComponent = null, languages, defaultLanguage } = pluginOptions
  if (!languages.includes(defaultLanguage)) {
    languages.push(defaultLanguage)
  }
  const regex = new RegExp("(" + languages.map(l => l.split("-")[0]).join("|") + ")$")
  actions.setWebpackConfig({
    resolve: { fallback: { path: require.resolve("path-browserify") } },
    plugins: [
      plugins.define({
        GATSBY_INTL_REDIRECT_COMPONENT_PATH: JSON.stringify(redirectComponent),
        "process.platform": JSON.stringify("linux"),
      }),
      new webpack.ContextReplacementPlugin(
        /@formatjs[/\\]intl-relativetimeformat[/\\]locale-data$/,
        regex
      ),
      new webpack.ContextReplacementPlugin(
        /@formatjs[/\\]intl-pluralrules[/\\]locale-data$/,
        regex
      ),
    ],
  })
}

exports.onCreatePage = async ({ page, actions }, pluginOptions) => {
  //Exit if the page has already been processed.
  if (typeof page.context.intl === "object") {
    return
  }
  const { createPage, deletePage } = actions
  const {
    path = ".",
    languages = ["en"],
    defaultLanguage = "en",
    fallbackLanguage = "",
    redirect = false,
    ignoredPaths = [],
    redirectDefaultLanguageToRoot = false,
  } = pluginOptions

  const getMessages = (path, language) => {
    try {
      // TODO load yaml here
      const messages = () => {
        if (fs.existsSync(`${path}/${language}.yaml`)) {
          return readYaml.sync(`${path}/${language}.yaml`);
         } else if (fs.existsSync(`${path}/${language}.yml`)) {
          return readYaml.sync(`${path}/${language}.yml`);
         } else {
          return require(`${path}/${language}.json`)
         }
      };
      

      return flattenMessages(messages)
    } catch (error) {
      if (error.code === "MODULE_NOT_FOUND") {
        process.env.NODE_ENV !== "test" &&
          console.error(
            `[gatsby-plugin-intl] couldn't find file "${path}/${language}.(json|yml|yaml)"`
          )
      }

      throw error
    }
  }

  const generatePage = (routed, language) => {
    const messages = getMessages(path, language)
    const newPath = routed ? `/${language}${page.path}` : page.path
    return {
      ...page,
      path: newPath,
      context: {
        ...page.context,
        language,
        intl: {
          language,
          languages,
          messages,
          routed,
          originalPath: page.path,
          redirect,
          redirectDefaultLanguageToRoot,
          defaultLanguage,
          fallbackLanguage,
          ignoredPaths,
        },
      },
    }
  }

  const newPage = generatePage(false, defaultLanguage)
  deletePage(page)
  createPage(newPage)

  languages.forEach(language => {
    // check ignore paths, if matched then don't generate locale page
    if (!isMatch(ignoredPaths, page.path)) {
      if (
        redirectDefaultLanguageToRoot === true &&
        language === defaultLanguage
      ) {
        // default language will redirect to root, so there is no need to generate default langauge pages
        // do nothing
      } else {
        const localePage = generatePage(true, language)
        const regexp = new RegExp("/404/?$")
        if (regexp.test(localePage.path)) {
          localePage.matchPath = `/${language}/*`
        }
        createPage(localePage)
      }
    }
  })
}
