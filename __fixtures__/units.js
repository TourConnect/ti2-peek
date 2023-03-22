module.exports = [{
  id: 'adult',
  internalName: 'Adult',
  reference: 'adult',
  type: 'ADULT',
  requiredContactFields: [],
  restrictions: {
    minAge: 16,
    maxAge: 59,
    idRequired: false,
    minQuantity: null,
    maxQuantity: null,
    paxCount: 1,
    accompaniedBy: []
  },
  title: 'Adult',
  titlePlural: 'Adults',
  subtitle: 'Aged 16 - 59',
  pricingFrom: [
    {
      original: 3600,
      retail: 2430,
      net: 2160,
      currency: 'USD',
      currencyPrecision: 2,
      includedTaxes: []
    },
    {
      original: 1996,
      retail: 1796,
      net: 1597,
      currency: 'GBP',
      currencyPrecision: 2,
      includedTaxes: []
    },
    {
      original: 2900,
      retail: 2160,
      net: 1920,
      currency: 'EUR',
      currencyPrecision: 2,
      includedTaxes: []
    }
  ]
},
  {
    id: 'child',
    internalName: 'Child',
    reference: 'child',
    type: 'CHILD',
    requiredContactFields: [],
    restrictions: {
      minAge: 3,
      maxAge: 16,
      idRequired: false,
      minQuantity: null,
      maxQuantity: null,
      paxCount: 1,
      accompaniedBy: []
    },
    title: 'Child',
    titlePlural: 'Children',
    subtitle: 'Aged 3-16',
    pricingFrom: [
      {
        original: 1900,
        retail: 1260,
        net: 1120,
        currency: 'USD',
        currencyPrecision: 2,
        includedTaxes: []
      },
      {
        original: 998,
        retail: 898,
        net: 798,
        currency: 'GBP',
        currencyPrecision: 2,
        includedTaxes: []
      },
      {
        original: 1500,
        retail: 1080,
        net: 960,
        currency: 'EUR',
        currencyPrecision: 2,
        includedTaxes: []
      }
    ]
  },
  {
    id: 'senior',
    internalName: 'Senior',
    reference: 'senior',
    type: 'SENIOR',
    requiredContactFields: [],
    restrictions: {
      minAge: 60,
      maxAge: 100,
      idRequired: false,
      minQuantity: null,
      maxQuantity: null,
      paxCount: 1,
      accompaniedBy: []
    },
    title: 'Senior',
    titlePlural: 'Seniors',
    subtitle: 'Aged over 60',
    pricingFrom: [
      {
        original: 3400,
        retail: 2250,
        net: 2000,
        currency: 'USD',
        currencyPrecision: 2,
        includedTaxes: []
      },
      {
        original: 1871,
        retail: 1684,
        net: 1497,
        currency: 'GBP',
        currencyPrecision: 2,
        includedTaxes: []
      },
      {
        original: 2600,
        retail: 1980,
        net: 1760,
        currency: 'EUR',
        currencyPrecision: 2,
        includedTaxes: []
      }
    ]
  },
  {
    id: 'family',
    internalName: 'Family',
    reference: 'family',
    type: 'FAMILY',
    requiredContactFields: [],
    restrictions: {
      minAge: 0,
      maxAge: 100,
      idRequired: false,
      minQuantity: null,
      maxQuantity: null,
      paxCount: 4,
      accompaniedBy: []
    },
    title: 'Family',
    titlePlural: 'Families',
    subtitle: '0+',
    pricingFrom: [
      {
        original: 10000,
        retail: 6750,
        net: 6000,
        currency: 'USD',
        currencyPrecision: 2,
        includedTaxes: []
      },
      {
        original: 5599,
        retail: 5039,
        net: 4479,
        currency: 'GBP',
        currencyPrecision: 2,
        includedTaxes: []
      },
      {
        original: 7800,
        retail: 5940,
        net: 5280,
        currency: 'EUR',
        currencyPrecision: 2,
        includedTaxes: []
      }
    ]
  }];

