const { makeExecutableSchema } = require('@graphql-tools/schema');
const { graphql } = require('graphql');
const R = require('ramda');
const jwt = require('jsonwebtoken');

const resolvers = {
  Query: {
    key: (root, args) => {
      const {
        productId,
        optionId,
        // currency,
        unitsWithQuantity,
        jwtKey,
      } = args;
      if (!jwtKey) return null;
      if (root.status !== 'AVAILABLE' && root.status !== 'FREESALE') return null;
      return jwt.sign(({
        productId,
        optionId,
        availabilityId: root.id,
        // currency,
        unitItems: R.chain(u => {
          return new Array(u.quantity).fill(1).map(() => ({
            unitId: u.unitId,
          }));
        }, unitsWithQuantity),
      }), jwtKey);
    },
    dateTimeStart: root => R.path(['localDateTimeStart'], root) || R.path(['localDate'], root),
    dateTimeEnd: root => R.path(['localDateTimeEnd'], root) || R.path(['localDate'], root),
    allDay: R.path(['allDay']),
    vacancies: R.prop('vacancies'),
    available: avail => Boolean(avail.status === 'AVAILABLE' || avail.status === 'FREESALE'),
    // get the starting price
    pricing: root => R.path(['pricing'], root) || R.path(['pricingFrom'], root),
    unitPricing: root => R.path(['unitPricing'], root) || R.path(['unitPricingFrom'], root),
    pickupAvailable: R.prop('pickupAvailable'),
    pickupRequired: R.prop('pickupRequired'),
    pickupPoints: root => R.pathOr([], ['pickupPoints'], root)
      .map(o => ({
        ...o,
        postal: o.postal_code,
      })),
  },
  Pricing: {
    unitId: R.prop('unitId'),
    original: R.prop('original'),
    retail: R.prop('retail'),
    net: R.prop('net'),
    currencyPrecision: R.prop('currencyPrecision'),
  },
};


const translateAvailability = async ({ rootValue, variableValues, typeDefs, query }) => {
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  })
  const retVal = await graphql({
    schema,
    rootValue,
    source: query,
    variableValues,
  });
  if (retVal.errors) throw new Error(retVal.errors);
  return retVal.data;
};
module.exports = {
  translateAvailability,
};
