/* globals describe, beforeAll, it, expect */
const R = require('ramda');
const axios = require('axios');
const moment = require('moment');
const faker = require('faker');

const Plugin = require('./index');

const { typeDefs: productTypeDefs, query: productQuery } = require('./node_modules/ti2/controllers/graphql-schemas/product');
const { typeDefs: availTypeDefs, query: availQuery } = require('./node_modules/ti2/controllers/graphql-schemas/availability');
const { typeDefs: bookingTypeDefs, query: bookingQuery } = require('./node_modules/ti2/controllers/graphql-schemas/booking');
const { typeDefs: rateTypeDefs, query: rateQuery } = require('./node_modules/ti2/controllers/graphql-schemas/rate');
const { typeDefs: pickupTypeDefs, query: pickupQuery } = require('./node_modules/ti2/controllers/graphql-schemas/pickup-point');

const typeDefsAndQueries = {
  productTypeDefs,
  productQuery,
  availTypeDefs,
  availQuery,
  bookingTypeDefs,
  bookingQuery,
  rateTypeDefs,
  rateQuery,
  pickupQuery,
  pickupTypeDefs,
};

const app = new Plugin({
  jwtKey: process.env.ti2_peek_jwtKey,
});
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

describe('search tests', () => {
  let products;
  let testProduct = {
    productId: 'av_86yvp',
    productName: 'Bike Rental - OCTO',
  };
  const token = {
    apiKey: process.env.ti2_peek_apiKey,
  };
  const dateFormat = 'DD/MM/YYYY';
  beforeAll(async () => {
    // nada
  });
  describe('utilities', () => {
    describe('validateToken', () => {
      it('valid token', async () => {
        expect(token).toBeTruthy();
        const retVal = await app.validateToken({
          axios,
          token,
        });
        expect(retVal).toBeTruthy();
      });
      it('invalid token', async () => {
        const retVal = await app.validateToken({
          axios,
          token: { someRandom: 'thing' },
        });
        expect(retVal).toBeFalsy();
      });
    });
    describe('template tests', () => {
      let template;
      it('get the template', async () => {
        template = await app.tokenTemplate();
        const rules = Object.keys(template);
        expect(rules).toContain('apiKey');
      });
      it('apiKey', () => {
        const apiKey = template.apiKey.regExp;
        expect(apiKey.test('something')).toBeFalsy();
        expect(apiKey.test(process.env.ti2_peek_apiKey)).toBeTruthy();
      });
    });
  });
  describe('booking process', () => {
    it('get for all products, a test product should exist', async () => {
      const retVal = await app.searchProducts({
        axios,
        token,
        typeDefsAndQueries,
      });
      expect(Array.isArray(retVal.products)).toBeTruthy();
      // console.log(retVal.products.filter(({ productName }) => productName === testProduct.productName));
      expect(retVal.products).toContainObject([{
        productName: testProduct.productName,
      }]);
      testProduct = {
        ...retVal.products.find(({ productName }) => productName === testProduct.productName),
      };
      expect(testProduct.productId).toBeTruthy();
    });
    it('should be able to get a single product', async () => {
      const retVal = await app.searchProducts({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          productId: testProduct.productId,
        },
      });
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products).toHaveLength(1);
    });
    let busProducts = [];
    it('should be able to get a product by name', async () => {
      const retVal = await app.searchProducts({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          productName: '*Bike Rental*',
        },
      });
      expect(Array.isArray(retVal.products)).toBeTruthy();
      expect(retVal.products.length).toBeGreaterThan(0);
      busProducts = retVal.products;
    });
    it('should be able to get an availability calendar', async () => {
      const retVal = await app.availabilityCalendar({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(1, 'M').format(dateFormat),
          endDate: moment().add(1, 'M').add(2, 'd').format(dateFormat),
          dateFormat,
          productIds: [
            'av_86yvp',
          ],
          optionIds: ['av_86yvp'],
          units: [
            [{ unitId:'66d2b836-828d-4c88-a24a-ff42a2e54880', quantity: 2 }],
          ],
        },
      });
      expect(retVal).toBeTruthy();
      const { availability } = retVal;
      expect(availability).toHaveLength(1);
      expect(availability[0].length).toBeGreaterThan(0);
    });
    let availabilityKey;
    it('should be able to get availability', async () => {
      const retVal = await app.searchAvailability({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          startDate: moment().add(2, 'M').format(dateFormat),
          endDate: moment().add(2, 'M').format(dateFormat),
          dateFormat,
          productIds: [
            'av_86yvp',
          ],
          optionIds: ['av_86yvp'],
          units: [
            [{ unitId:'66d2b836-828d-4c88-a24a-ff42a2e54880', quantity: 2 }],
          ],
        },
      });
      expect(retVal).toBeTruthy();
      const { availability } = retVal;
      expect(availability).toHaveLength(1);
      expect(availability[0].length).toBeGreaterThan(0);
      availabilityKey = R.path([0, 0, 'key'], availability);
      expect(availabilityKey).toBeTruthy();
    });
    let booking;
    const reference = faker.datatype.uuid();
    it('should be able to create a booking', async () => {
      const fullName = faker.name.findName().split(' ');
      const retVal = await app.createBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          availabilityKey,
          notes: faker.lorem.paragraph(),
          settlementMethod: 'DEFERRED',
          holder: {
            name: fullName[0],
            surname: fullName[1],
            emailAddress: `engineering+peektests_${faker.lorem.slug()}@tourconnect.com`,
            country: faker.address.countryCode(),
          },
          reference,
        },
      });
      expect(retVal.booking).toBeTruthy();
      ({ booking } = retVal);
      expect(booking).toBeTruthy();
      expect(R.path(['id'], booking)).toBeTruthy();
      expect(R.path(['supplierBookingId'], booking)).toBeTruthy();
      expect(R.path(['cancellable'], booking)).toBeTruthy();
    });
    let bookings = [];
    it('it should be able to search bookings by id', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: booking.id,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    it('it should be able to search bookings by reference', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: reference,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    it('it should be able to search bookings by supplierBookingId', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: booking.supplierBookingId,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    it('it should be able to search bookings by travelDate', async () => {
      const retVal = await app.searchBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          travelDateStart: moment().add(2, 'M').format(dateFormat),
          travelDateEnd: moment().add(2, 'M').format(dateFormat),
          dateFormat,
        },
      });
      expect(Array.isArray(retVal.bookings)).toBeTruthy();
      ({ bookings } = retVal);
      expect(R.path([0, 'id'], bookings)).toBeTruthy();
    });
    it('should be able to cancel the booking', async () => {
      const retVal = await app.cancelBooking({
        axios,
        token,
        typeDefsAndQueries,
        payload: {
          bookingId: booking.id,
          reason: faker.lorem.paragraph(),
        },
      });
      const { cancellation } = retVal;
      expect(cancellation).toBeTruthy();
      expect(R.path(['id'], cancellation)).toBeTruthy();
      expect(R.path(['cancellable'], cancellation)).toBeFalsy();
    });
  });
});
