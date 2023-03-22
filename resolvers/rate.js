const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

const resolvers = {
  Query: {
    rateId: R.path(['unitId']),
    rateName: root => R.toLower(R.path(['unitName'], root)),
    pricing: root => [{
      original: R.path(['total_including_tax'], root),
      retail: R.path(['total_including_tax'], root),
      currencyPrecision: 2,
      currency: R.path(['company', 'currency'], root),
    }],
  },
};

const translateRate = async ({ rootValue, typeDefs, query }) => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });
  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
  });
  if (retVal.errors) throw new Error(retVal.errors);
  return retVal.data;
};

module.exports = {
  translateRate,
};
