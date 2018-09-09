module.exports = {
  modules: true,
  plugins: {
    'postcss-modules': {
      generateScopedName: "_[name]__[local]",
      getJSON: (cssFileName, json) => {
        let tsFile = Object.keys(json)
          .map(key => `export let ${key}:string;`)
          .join('\n');
        require('fs').writeFileSync(cssFileName + '.d.ts', tsFile);
      }
    }
  }
};
