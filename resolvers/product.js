const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

const resolvers = {
  Query: {
    productId: R.path(['id']),
    productName: R.path(['internalName']),
    availableCurrencies: root => {
      const result = R.propOr([], 'availableCurrencies', root);
      return R.uniq(result);
    },
    defaultCurrency: R.path(['defaultCurrency']),
    options: R.propOr([], 'options'),
  },
  Option: {
    optionId: R.prop('id'),
    optionName: R.prop('internalName'),
    units: R.propOr([], ['units']),
  },
  Unit: {
    unitId: R.path(['id']),
    unitName: R.pathOr('', ['internalName']),
    subtitle: R.pathOr('', ['note']),
    type: R.prop('type'),
    pricing: root => R.propOr([], 'pricingFrom', root).map(p => ({
      original: R.path(['subtotal'], p),
      retail: R.path(['subtotal'], p),
      currencyPrecision: R.path(['currencyPrecision'], p),
      currency: R.path(['currency'], p),
    })),
    restrictions: R.propOr({}, 'restrictions'),
  },
};

const translateProduct = async ({
  rootValue,
  typeDefs,
  query,
}) => {
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
  translateProduct,
};
