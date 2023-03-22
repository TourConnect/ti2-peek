const { makeExecutableSchema } = require('@graphql-tools/schema');
const R = require('ramda');
const { graphql } = require('graphql');

const capitalize = sParam => {
  if (typeof sParam !== 'string') return '';
  const s = sParam.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
const isNilOrEmptyArray = el => {
  if (!Array.isArray(el)) return true;
  return R.isNil(el) || R.isEmpty(el);
};

const resolvers = {
  Query: {
    id: R.path(['uuid']),
    orderId: R.pathOr('', ['orderReference']),
    bookingId: R.pathOr('', ['supplierReference']),
    supplierBookingId: R.path(['supplierReference']),
    status: e => capitalize(R.path(['status'], e)),
    productId: R.path(['product', 'id']),
    productName: R.path(['product', 'title']),
    cancellable: root => {
      if (root.status === 'CANCELED') return false;
      return root.cancellable;
    },
    editable: () => false,
    unitItems: ({ unitItems = [] }) => unitItems.map(unitItem => ({
      unitItemId: R.path(['uuid']),
      unitId: R.path(['unitId']),
      unitName: R.pathOr('', ['unit', 'title']),
    })),
    start: R.path(['availability', 'localDateTimeStart']),
    end: R.path(['availability', 'localDateTimeEnd']),
    allDay: R.path(['availability', 'allDay']),
    bookingDate: R.path(['utcCreatedAt']),
    holder: root => ({
      name: R.path(['contact', 'firstName'], root),
      surname: R.path(['contact', 'lastName'], root),
      fullName: R.path(['contact', 'fullName'], root),
      phoneNumber: R.path(['contact', 'phoneNumber'], root),
      emailAddress: R.path(['contact', 'emailAddress'], root),
    }),
    notes: R.pathOr('', ['notes']),
    price: root => ({
      original: R.path(['pricing', 'total'], root),
      retail: R.path(['pricing', 'total'], root),
      currencyPrecision: R.path(['pricing', 'currencyPrecision'], root),
      currency: R.path(['pricing', 'currency'], root),
    }),
    cancelPolicy: root => {
      const cancellationCutoff = R.pathOr('', ['option', 'cancellationCutoff'], root);
      if (cancellationCutoff) return `Cancel before ${cancellationCutoff} of departure time.`;
      return '';
    },
    optionId: R.path(['optionId']),
    optionName: ({ option }) => option ? option.internalName : '',
    resellerReference: R.propOr('', 'resellerReference'),
    // TODO
    publicUrl: R.prop('confirmation_url'),
    privateUrl: R.prop('dashboard_url'),
    pickupRequested: R.prop('pickupRequested'),
    pickupPointId: R.prop('pickupPointId'),
    pickupPoint: root => {
      const pickupPoint = R.path(['pickupPoint'], root);
      if (!pickupPoint) return null;
      return {
        ...pickupPoint,
        postal: pickupPoint.postal_code,
      };
    },
  },
};


const translateBooking = async ({ rootValue, typeDefs, query }) => {
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
  translateBooking,
};
