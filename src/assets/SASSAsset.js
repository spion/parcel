const CSSAsset = require('./CSSAsset');
const localRequire = require('../utils/localRequire');
const promisify = require('../utils/promisify');
const path = require('path');
const fs = require('fs');

function maybeAddScss(s) {
  return /\.scss$/.test(s) ? s : s + '.scss';
}
let templatesToTry = [
  maybeAddScss,
  s => maybeAddScss(path.join(path.dirname(s), '_' + path.basename(s))),
  s => s + '/index.scss'
];

function resolvePath(prev, file, includePaths) {
  prev = path.resolve(process.cwd(), path.dirname(prev));
  includePaths = [prev].concat(includePaths);
  for (let t of templatesToTry) {
    let realFile = t(file);
    for (let ip of includePaths) {
      let realIp = path.resolve(process.cwd(), ip);
      let absolute = path.resolve(realIp, realFile);
      //console.log("Resolving a sass asset", absolute)
      if (fs.existsSync(absolute)) {
        return absolute;
      }
    }
  }
  return null;
}

class SASSAsset extends CSSAsset {
  async parse(code) {
    // node-sass should be installed locally in the module that's being required
    let sass = await localRequire('node-sass', this.name);
    let render = promisify(sass.render.bind(sass));

    let opts =
      this.package.sass ||
      (await this.getConfig(['.sassrc', '.sassrc.js'])) ||
      {};
    if (!opts.relativeUrls) {
      opts.includePaths = (opts.includePaths || []).concat(
        path.dirname(this.name)
      );
    }
    opts.data = code;
    opts.indentedSyntax =
      typeof opts.indentedSyntax === 'boolean'
        ? opts.indentedSyntax
        : path.extname(this.name).toLowerCase() === '.sass';

    if (opts.relativeUrls) {
      opts.importer = (url, previousUrl) => {
        let realPreviousUrl = previousUrl === 'stdin' ? this.name : previousUrl;
        let absUrl = resolvePath(realPreviousUrl, url, opts.includePaths);
        let absDir = path.dirname(absUrl);
        let thisDir = path.dirname(this.name);
        let newContent = fs
          .readFileSync(absUrl, 'utf8')
          .replace(/url\(['"]?(\.[^)'"]+)['"]?\)/g, (_, assetUrl) => {
            let assetAbsolute = path.resolve(absDir, assetUrl);
            let newAssetUrl = path.relative(thisDir, assetAbsolute);
            return "url('" + newAssetUrl + "')";
          });
        return {file: absUrl, contents: newContent};
      };
    }

    opts.functions = Object.assign({}, opts.functions, {
      url: node => {
        let filename = this.addURLDependency(node.getValue());
        return new sass.types.String(`url(${JSON.stringify(filename)})`);
      }
    });

    let res = await render(opts);
    res.render = () => res.css.toString();
    return res;
  }

  collectDependencies() {
    for (let dep of this.ast.stats.includedFiles) {
      this.addDependency(dep, {includedInParent: true});
    }
  }
}

module.exports = SASSAsset;
