const axiosRaw = require('axios');
const curlirize = require('axios-curlirize');
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
if (process.env.debug) {
  curlirize(axiosRaw);
}

const isNilOrEmpty = R.either(R.isNil, R.isEmpty);

const getHeaders = ({
  apiKey,
}) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'Octo-Capabilities': 'octo/pricing,octo/pickups,octo/cart',
});


const axiosSafeRequest = R.pick(['headers', 'method', 'url', 'data']);
const axiosSafeResponse = response => {
  const retVal = R.pick(['data', 'status', 'statusText', 'headers', 'request'], response);
  retVal.request = axiosSafeRequest(retVal.request);
  return retVal;
};
class Plugin {
  constructor(params) { // we get the env variables from here
    Object.entries(params).forEach(([attr, value]) => {
      this[attr] = value;
    });
    if (this.events) {
      axiosRaw.interceptors.request.use(request => {
        this.events.emit(`${this.name}.axios.request`, axiosSafeRequest(request));
        return request;
      });
      axiosRaw.interceptors.response.use(response => {
        this.events.emit(`${this.name}.axios.response`, axiosSafeResponse(response));
        return response;
      });
    }
    const pluginObj = this;
    this.axios = async (...args) => axiosRaw(...args).catch(err => {
      const errMsg = R.omit(['config'], err.toJSON());
      console.log(`error in ${this.name}`, args[0], errMsg, err.response.data);
      if (pluginObj.events) {
        pluginObj.events.emit(`${this.name}.axios.error`, {
          request: args[0],
          err: errMsg,
        });
      }
      throw R.pathOr(err, ['response', 'data', 'details'], err);
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
    token: {
      apiKey,
    },
  }) {
    const url = `${endpoint || this.endpoint}/products/`;
    const headers = getHeaders({
      apiKey,
    });
    try {
      const suppliers = R.path(['data'], await this.axios({
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
    let results = R.pathOr([], ['data'], await this.axios({
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
        // we will do some match and filtering later
        const availWithoutUnits = R.path(['data'], await this.axios({
          method: 'post',
          url,
          data: R.omit(['units'], data),
          headers,
        }));
        const availWithUnits = R.path(['data'], await this.axios({
          method: 'post',
          url,
          data,
          headers,
        }));
        return availWithUnits.map(avail => {
          const foundMatch = availWithoutUnits.find(a => a.id === avail.id);
          if (!foundMatch) return avail;
          return {
            ...avail,
            unitPricing: foundMatch.unitPricing,
          }
        });
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
        const result = await this.axios({
          method: 'post',
          url,
          data,
          headers,
        });
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
    let booking = R.path(['data'], await this.axios({
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
    booking = R.path(['data'], await this.axios({
      method: 'post',
      url: `${endpoint || this.endpoint}/bookings/${booking.uuid}/confirm`,
      data: dataForConfirmBooking,
      headers,
    }));
    const { products: [product] } = await this.searchProducts({
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
          option: product.options.find(o => o.id === dataFromAvailKey.optionId),
        },
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async cancelBooking({
    token: {
      apiKey,
    },
    payload: {
      bookingId,
      id,
      reason,
    },
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
    const booking = R.path(['data'], await this.axios({
      method: 'delete',
      url,
      data: { reason },
      headers,
    }));
    return ({
      cancellation: await translateBooking({
        rootValue: booking,
        typeDefs: bookingTypeDefs,
        query: bookingQuery,
      })
    });
  }

  async searchBooking({
    token: {
      apiKey,
    },
    payload: {
      bookingId,
      travelDateStart,
      travelDateEnd,
      dateFormat,
    },
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
        return R.path(['data'], await this.axios({
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
        return R.path(['data'], await this.axios({
          method: 'get',
          url,
          headers,
        }));
      }
      return [];
    })();
    return ({
      bookings: await Promise.map(R.unnest(bookings), async booking => {
        return translateBooking({
          rootValue: booking,
          typeDefs: bookingTypeDefs,
          query: bookingQuery,
        });
      })
    });
  }
}

module.exports = Plugin;
