const serverlessExpress = require('@vendia/serverless-express');
const app = require('./server'); // your existing Express app

exports.handler = serverlessExpress({ app });