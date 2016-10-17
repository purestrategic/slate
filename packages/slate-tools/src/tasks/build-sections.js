/* eslint-disable no-sync */

const gulp = require('gulp');
const plumber = require('gulp-plumber');
const chokidar = require('chokidar');
const vinylPaths = require('vinyl-paths');
const fs = require('fs');
const del = require('del');
const size = require('gulp-size');
const _ = require('lodash');

const config = require('./includes/config.js');
const utils = require('./includes/utilities.js');
const messages = require('./includes/messages.js');

/**
 * Concat liquid/css/js/json section files from `src` to single liquid file in dist
 *
 * @param {String|Array} files - root section dir from build, array of files from watch
 * @returns {Stream}
 * @private
 */
function processAssets(files) {
  let sectionList = [];

  if (_.isArray(files)) {
    _.each(files, (file) => {
      const pathArray = file.split('/');
      const folderDepth = pathArray.length;
      let section = '';

      if (folderDepth === 4) {
        section = pathArray[pathArray.length - 2];
      } else if (folderDepth === 3) {
        section = pathArray[pathArray.length - 1];
      } else {
        return;
      }

      if (!_.includes(sectionList, section)) {
        sectionList.push(section);
      }
    });
  } else {
    sectionList = fs.readdirSync(files);
  }

  if (!fs.existsSync(config.dist.root)) { // eslint-disable-line node/no-deprecated-api
    fs.mkdirSync(config.dist.root);
  }
  if (!fs.existsSync(config.dist.sections)) { // eslint-disable-line node/no-deprecated-api
    fs.mkdirSync(config.dist.sections);
  }

  messages.logProcessFiles('build:sections');
  _.each(compileSections(sectionList), (section) => {
    if (typeof section !== 'undefined') {
      fs.writeFileSync(section.filename, section.content);
    }
  });
}

/**
 * @param {String} files
 * @returns {Stream}
 * @private
 */
function removeAssets(files) {
  const mapFiles = files.map((file) => {
    const distFile = file.replace(config.src.root, config.dist.root);
    return `${distFile}.liquid`;
  });

  messages.logProcessFiles('remove:sections');
  return gulp.src(mapFiles)
    .pipe(plumber(utils.errorHandler))
    .pipe(vinylPaths(del))
    .pipe(size({
      showFiles: true,
      pretty: true
    }));
}

/**
 * Reads files from the provided section paths and concats their contents into a
 * "compiled" map of sections to be written to the `dist` directory.
 *
 * @param {Array} sectionList
 * @returns {Array}
 * @private
 */
function compileSections(sectionList) {
  const sections = [];

  _.each(sectionList, (section, i) => {
    const path = config.src.sectionsDir + section;
    let sectionFiles = [];

    if (!utils.isDirectory(path)) {
      sections[i] = {
        filename: config.dist.sections + section,
        content: fs.readFileSync(path)
      };

      return;
    }

    sectionFiles = fs.readdirSync(path);
    sections[i] = {
      filename: `${config.dist.sections}${section}.liquid`,
      content: concatContent(sectionFiles, path)
    };
  });

  return sections;
}

/**
 * Concats the files for a particular section, in the appropriate order, skipping
 * any empty files along the way.
 *
 * @param {Array} files
 * @param {String} path
 * @returns {String}
 */
function concatContent(files, path) {
  const contents = [];
  const hasComments = /\s*(<style>)?\s*(\/\*(.*?\s*?)*?\*\/\s*)*(<\/style>)?/;
  const isEmpty = /^\s*$/;

  _.each(files, (file) => {
    const tempContents = fs.readFileSync(`${path}/${file}`, 'utf-8');
    let tempMatch;

    if (file === 'style.liquid') {
      tempMatch = tempContents.replace(hasComments, '');
      contents[0] = isEmpty.test(tempMatch) ? null : tempContents;

    } else if (file === 'template.liquid') {
      contents[1] = tempContents;

    } else if (file === 'javascript.js') {
      tempMatch = tempContents.replace(hasComments, '');
      contents[2] = isEmpty.test(tempMatch) ? null : `{% javascript %}\n${tempContents}{% endjavascript %}\n`;
    } else if (file === 'schema.json') {
      contents[3] = `{% schema %}\n${tempContents}{% endschema %}\n`;
    }
  });
  _.remove(contents, (item) => {
    return !item;
  });

  return contents.join('\n');
}

/**
 * Concat component files for each folder in `src/sections` into a single
 * `<section>.liquid` file and write to `dist/sections`.
 *
 * @function build:sections
 * @memberof slate-cli.tasks.build
 * @static
 */
gulp.task('build:sections', () => {
  const sectionsDir = config.src.sectionsDir;

  if (fs.existsSync(sectionsDir)) { // eslint-disable-line node/no-deprecated-api
    processAssets(sectionsDir);
  }
});

/**
 * Watch for changes in `src/sections`, process or remove assets as necessary
 *
 * @function watch:sections
 * @memberof slate-cli.tasks.watch
 * @static
 */
gulp.task('watch:sections', () => {
  const eventCache = utils.createEventCache({
    changeEvents: ['add', 'change', 'unlink'],
    unlinkEvents: ['unlinkDir']
  });

  chokidar.watch(config.src.sections, {
    ignoreInitial: true
  })
  .on('all', (event, path) => {
    messages.logFileEvent(event, path);
    eventCache.addEvent(event, path);
    utils.processCache(eventCache, processAssets, removeAssets);
  });
});