const path = require('path');

module.exports = (options, webpack) => {
  return {
    ...options,
    resolve: {
      ...options.resolve,
      modules: [
        path.resolve(__dirname, 'node_modules'),
        ...(options.resolve?.modules || ['node_modules']),
      ],
      alias: {
        ...options.resolve?.alias,
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
};
