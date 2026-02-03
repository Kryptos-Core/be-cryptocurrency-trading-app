const path = require('path');

module.exports = (options, webpack) => {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      alias: {
        ...options.resolve?.alias,
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
};
