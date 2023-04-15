const R = require('ramda');
const Promise = require('bluebird');
const assert = require('assert');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const wildcardMatch = require('./utils/wildcardMatch');
const { translateProduct } = require('./resolvers/product');
const { translateAvailability } = require('./resolvers/availability');
const { translateBooking } = require('./resolvers/booking');

const endpoint = 'https://octo.peek.com/integrations/octo';

const CONCURRENCY = 3; // is this ok ?

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

const getHeaders = ({
  apiKey,
}) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'Octo-Capabilities': 'octo/pricing,octo/pickups,octo/cart',
});


class Plugin {
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    this.tokenTemplate = () => ({
      apiKey: {
        type: 'text',
        regExp: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
        description: 'the Api Key generated from your Peek Pro account, should be in uuid format',
      },
    });
  }

  async validateToken({
    axios,
    token: {
      apiKey,
    },
  }) {
    const url = `${endpoint || this.endpoint}/products/`;
    const headers = getHeaders({
      apiKey,
    });
    try {
      const suppliers = R.path(['data'], await axios({
        method: 'get',
        url,
        headers,
      }));
      return Array.isArray(suppliers) && suppliers.length > 0;
    } catch (err) {
      return false;
    }
  }

  async searchProducts({
    axios,
    token: {
      apiKey,
    },
    payload,
    typeDefsAndQueries: {
      productTypeDefs,
      productQuery,
    },
  }) {
    let url = `${endpoint || this.endpoint}/products`;
    if (!isNilOrEmpty(payload)) {
      if (payload.productId) {
        url = `${url}/${payload.productId}`;
      }
    }
    const headers = getHeaders({
      apiKey,
    });
    let results = R.pathOr([], ['data'], await axios({
      method: 'get',
      url,
      headers,
    }));
    if (!Array.isArray(results)) results = [results];
    let products = await Promise.map(results, async product => {
      return translateProduct({
        rootValue: product,
        typeDefs: productTypeDefs,
        query: productQuery,
      });
    });
    // dynamic extra filtering
    if (!isNilOrEmpty(payload)) {
      const extraFilters = R.omit(['productId'], payload);
      if (Object.keys(extraFilters).length > 0) {
        products = products.filter(
          product => Object.entries(extraFilters).every(
            ([key, value]) => {
              if (typeof value === 'string') return wildcardMatch(value, product[key]);
              return true;
            },
          ),
        );
      }
    }
    return ({ products });
  }

  async searchQuote({
    token: {
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
    },
  }) {
    return { quote: [] };
  }

  async searchAvailability({
    axios,
    token: {
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
      units,
      startDate,
      endDate,
      dateFormat,
      currency,
    },
    typeDefsAndQueries: {
      availTypeDefs,
      availQuery,
    },
  }) {
    assert(this.jwtKey, 'JWT secret should be set');
    assert(
      productIds.length === optionIds.length,
      'mismatched productIds/options length',
    );
    assert(
      optionIds.length === units.length,
      'mismatched options/units length',
    );
    assert(productIds.every(Boolean), 'some invalid productId(s)');
    assert(optionIds.every(Boolean), 'some invalid optionId(s)');
    const localDateStart = moment(startDate, dateFormat).format('YYYY-MM-DD');
    const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD');
    const headers = getHeaders({
      apiKey,
    });
    const url = `${endpoint || this.endpoint}/availability`;
    let availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const data = {
          productId,
          optionId: optionIds[ix],
          localDateStart,
          localDateEnd,
          units: units[ix].map(u => ({ id: u.unitId, quantity: u.quantity })),
        };
        return R.path(['data'], await axios({
          method: 'post',
          url,
          data,
          headers,
        }));
      }, { concurrency: CONCURRENCY })
    );
    availability = await Promise.map(availability,
      (avails, ix) => {
        return Promise.map(avails,
          avail => translateAvailability({
            typeDefs: availTypeDefs,
            query: availQuery,
            rootValue: avail,
            variableValues: {
              productId: productIds[ix],
              optionId: optionIds[ix],
              currency,
              unitsWithQuantity: units[ix],
              jwtKey: this.jwtKey,
            },
          }),
        );
      },
    );
    return { availability };
  }

  async availabilityCalendar({
    axios,
    token: {
      apiKey,
    },
    payload: {
      productIds,
      optionIds,
      units,
      startDate,
      endDate,
      currency,
      dateFormat,
    },
    typeDefsAndQueries: {
      availTypeDefs,
      availQuery,
    },
  }) {
    assert(this.jwtKey, 'JWT secret should be set');
    assert(
      productIds.length === optionIds.length,
      'mismatched productIds/options length',
    );
    assert(
      optionIds.length === units.length,
      'mismatched options/units length',
    );
    assert(productIds.every(Boolean), 'some invalid productId(s)');
    assert(optionIds.every(Boolean), 'some invalid optionId(s)');
    const localDateStart = moment(startDate, dateFormat).format('YYYY-MM-DD');
    const localDateEnd = moment(endDate, dateFormat).format('YYYY-MM-DD');
    const headers = getHeaders({
      apiKey,
    });
    const url = `${endpoint || this.endpoint}/availability/calendar`;
    const availability = (
      await Promise.map(productIds, async (productId, ix) => {
        const data = {
          productId,
          optionId: optionIds[ix],
          localDateStart,
          localDateEnd,
          // units is required here to get the total pricing for the calendar
          units: units[ix].map(u => ({ id: u.unitId, quantity: u.quantity })),
        };
        const result = await axios({
          method: 'post',
          url,
          data,
          headers,
        });
        // console.log(result.data);
        return Promise.map(result.data, avail => translateAvailability({
          rootValue: avail,
          typeDefs: availTypeDefs,
          query: availQuery,
        }))
      }, { concurrency: CONCURRENCY })
    );
    return { availability };
  }

  async createBooking({
    axios,
    token: {
      apiKey,
    },
    payload: {
      availabilityKey,
      holder,
      notes,
      reference,
      // settlementMethod,
    },
    token,
    typeDefsAndQueries,
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(availabilityKey, 'an availability code is required !');
    assert(R.path(['name'], holder), 'a holder\' first name is required');
    assert(R.path(['surname'], holder), 'a holder\' surname is required');
    const headers = getHeaders({
      apiKey,
    });
    const urlForCreateBooking = `${endpoint || this.endpoint}/bookings`;
    const dataFromAvailKey = await jwt.verify(availabilityKey, this.jwtKey);
    let booking = R.path(['data'], await axios({
      method: 'post',
      url: urlForCreateBooking,
      data: {
        // settlementMethod, 
        ...R.omit(['iat', 'currency'], dataFromAvailKey),
        notes,
      },
      headers,
    }));
    const dataForConfirmBooking = {
      contact: {
        fullName: `${holder.name} ${holder.surname}`,
        emailAddress: R.path(['emailAddress'], holder),
        phoneNumber: R.pathOr('', ['phoneNumber'], holder),
        locales: R.pathOr(null, ['locales'], holder),
        country: R.pathOr('', ['country'], holder),
      },
      resellerReference: reference,
      // settlementMethod,
    };
    booking = R.path(['data'], await axios({
      method: 'post',
      url: `${endpoint || this.endpoint}/bookings/${booking.uuid}/confirm`,
      data: dataForConfirmBooking,
      headers,
    }));
    const { products: [product] } = await this.searchProducts({
      axios,
      typeDefsAndQueries,
      token,
      payload: {
        productId: dataFromAvailKey.productId,
      }
    });
    return ({
      booking: await translateBooking({
        rootValue: {
          ...booking,
          product,
          option: product.options.find(o => o.optionId === dataFromAvailKey.optionId),
        },
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async cancelBooking({
    axios,
    token: {
      apiKey,
    },
    payload: {
      bookingId,
      id,
      reason,
    },
    typeDefsAndQueries,
    token,
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(!isNilOrEmpty(bookingId) || !isNilOrEmpty(id), 'Invalid booking id');
    const headers = getHeaders({
      apiKey,
    });
    const url = `${endpoint || this.endpoint}/bookings/${bookingId || id}`;
    const booking = R.path(['data'], await axios({
      method: 'delete',
      url,
      data: { reason },
      headers,
    }));
    const { products: [product] } = await this.searchProducts({
      axios,
      typeDefsAndQueries,
      token,
      payload: {
        productId: booking.productId,
      }
    });
    return ({
      cancellation: await translateBooking({
        rootValue: {
          ...booking,
          product,
          option: product.options.find(o => o.optionId === booking.optionId),
        },
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async searchBooking({
    axios,
    token: {
      apiKey,
    },
    payload: {
      bookingId,
      travelDateStart,
      travelDateEnd,
      dateFormat,
    },
    typeDefsAndQueries,
    token,
    typeDefsAndQueries: {
      bookingTypeDefs,
      bookingQuery,
    },
  }) {
    assert(
      !isNilOrEmpty(bookingId)
      || !(
        isNilOrEmpty(travelDateStart) && isNilOrEmpty(travelDateEnd) && isNilOrEmpty(dateFormat)
      ),
      'at least one parameter is required',
    );
    const headers = getHeaders({
      apiKey,
    });
    const searchByUrl = async url => {
      try {
        return R.path(['data'], await axios({
          method: 'get',
          url,
          headers,
        }));
      } catch (err) {
        return [];
      }
    };
    const bookings = await (async () => {
      let url;
      if (!isNilOrEmpty(bookingId)) {
        return Promise.all([
          searchByUrl(`${endpoint || this.endpoint}/bookings/${bookingId}`),
          searchByUrl(`${endpoint || this.endpoint}/bookings?resellerReference=${bookingId}`),
          searchByUrl(`${endpoint || this.endpoint}/bookings?supplierReference=${bookingId}`),
        ]);
      }
      if (!isNilOrEmpty(travelDateStart)) {
        const localDateStart = moment(travelDateStart, dateFormat).format('YYYY-MM-DD');
        const localDateEnd = moment(travelDateEnd, dateFormat).format('YYYY-MM-DD');
        url = `${endpoint || this.endpoint}/bookings?localDateStart=${encodeURIComponent(localDateStart)}&localDateEnd=${encodeURIComponent(localDateEnd)}`;
        return R.path(['data'], await axios({
          method: 'get',
          url,
          headers,
        }));
      }
      return [];
    })();
    return ({
      bookings: await Promise.map(R.unnest(bookings), async booking => {
        const { products: [product] } = await this.searchProducts({
          axios,
          typeDefsAndQueries,
          token,
          payload: {
            productId: booking.productId,
          }
        });
        return translateBooking({
          rootValue: {
            ...booking,
            product,
            option: product.options.find(o => o.optionId === booking.optionId),
          },
          typeDefs: bookingTypeDefs,
          query: bookingQuery,
        });
      })
    });
  }
}

module.exports = Plugin;
