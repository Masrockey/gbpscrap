export const profileResponseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Business name' },
    rating: { type: 'number', nullable: true, description: 'Average star rating' },
    reviewCount: { type: 'integer', nullable: true, description: 'Total review count' },
    category: { type: 'string', nullable: true, description: 'Business primary category' },
    address: { type: 'string', nullable: true, description: 'Full business address' },
    phone: { type: 'string', nullable: true, description: 'Phone number' },
    website: { type: 'string', nullable: true, description: 'Website URL' },
    openingHours: {
      type: 'array',
      items: { type: 'string' },
      description: 'Daily opening hours'
    },
    placeUrl: { type: 'string', description: 'Canonical Google Maps URL' },
    latitude: { type: 'number', nullable: true, description: 'Latitude coordinates' },
    longitude: { type: 'number', nullable: true, description: 'Longitude coordinates' }
  }
};

export const reviewItemSchema = {
  type: 'object',
  properties: {
    reviewId: { type: 'string', nullable: true, description: 'Google Maps Review ID' },
    reviewUrl: { type: 'string', nullable: true, description: 'Direct Google Maps Review URL' },
    author: { type: 'string', description: 'Reviewer display name (anonymized if personalData is false)' },
    authorProfileUrl: { type: 'string', nullable: true, description: 'Reviewer profile URL (null if personalData is false)' },
    rating: { type: 'number', description: 'Star rating given (1-5)' },
    relativeTime: { type: 'string', nullable: true, description: 'Relative time of review (e.g. 2 weeks ago)' },
    publishedAtDate: { type: 'string', nullable: true, description: 'Estimated ISO date parsed from relative time' },
    text: { type: 'string', nullable: true, description: 'Review comment/body' },
    likes: { type: 'integer', description: 'Number of likes/helpful marks' },
    ownerResponse: {
      type: 'object',
      nullable: true,
      properties: {
        text: { type: 'string' },
        date: { type: 'string', nullable: true }
      }
    }
  }
};

const commonInputProperties = {
  url: {
    type: 'string',
    format: 'uri',
    example: 'https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9',
    description: 'Direct Google Maps Place URL or shortlink (PILIHAN 1: gunakan salah satu)'
  },
  placeId: {
    type: 'string',
    example: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    description: 'Single Google Maps Place ID (PILIHAN 2: gunakan salah satu)'
  },
  placeIds: {
    type: 'array',
    items: {
      type: 'string',
      example: 'ChIJN1t_tDeuEmsRUsoyG83frY4'
    },
    description: 'Array of Google Maps Place IDs (opsional jika multiple)'
  },
  startUrls: {
    type: 'array',
    items: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          example: 'https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9',
          description: 'Google Maps Place URL or shortlink'
        }
      }
    },
    description: 'Array of start URLs to scrape (opsional jika multiple)'
  },
  query: {
    type: 'string',
    description: 'Search query (e.g. "Monumen Nasional")'
  },
  language: { type: 'string', default: 'id', example: 'id', description: 'Language code (e.g. "id", "en")' },
  hl: { type: 'string', example: 'id', description: 'Alias for language' },
  maxReviews: { type: 'integer', default: 5, minimum: 1, maximum: 1000, example: 5, description: 'Maximum reviews to extract' },
  personalData: { type: 'boolean', default: false, example: false, description: 'Include reviewer personal data (name, profile URL). If false, PII is anonymized.' },
  reviewsStartDate: { type: 'string', example: '2026-01-01', description: 'Filter reviews starting from this date (YYYY-MM-DD)' },
  sortBy: {
    type: 'string',
    enum: ['newest', 'highest', 'lowest', 'relevant'],
    default: 'newest',
    example: 'newest',
    description: 'Review sort order'
  },
  useProxy: {
    type: 'boolean',
    default: true,
    example: true,
    description: 'Gunakan proxy rotasi otomatis dari Proxifly untuk menghindari limitasi Google. Default: true.'
  },
  proxyUrl: {
    type: 'string',
    example: 'socks5://1.2.3.4:1080',
    description: 'Custom proxy URL tunggal jika ingin menggunakan proxy sendiri (opsional).'
  },
  proxyUrls: {
    type: 'array',
    items: { type: 'string' },
    description: 'Daftar custom proxy URLs jika ingin menggunakan pool proxy sendiri (opsional).'
  }
};

export const getProxyStatsSchema = {
  description: 'Get current proxy pool statistics and health status',
  tags: ['System'],
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            totalLoaded: { type: 'integer' },
            deadCount: { type: 'integer' },
            activePoolSize: { type: 'integer' },
            lastFetchedAt: { type: 'string', nullable: true },
            sourceUrl: { type: 'string' }
          }
        }
      }
    }
  }
};

export const scrapeProfileSchema = {
  description: 'Scrape Google Business Profile metadata (synchronous)',
  tags: ['Scraper'],
  body: {
    type: 'object',
    properties: commonInputProperties,
    examples: [
      {
        url: 'https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9',
        language: 'id'
      }
    ]
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: profileResponseSchema,
        results: {
          type: 'array',
          items: profileResponseSchema
        }
      }
    },
    400: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      }
    }
  }
};

export const scrapeReviewsSchema = {
  description: 'Scrape Google Business reviews (synchronous)',
  tags: ['Scraper'],
  body: {
    type: 'object',
    properties: commonInputProperties,
    examples: [
      {
        url: 'https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9',
        maxReviews: 5,
        language: 'id',
        personalData: false,
        sortBy: 'newest'
      }
    ]
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            businessName: { type: 'string' },
            placeUrl: { type: 'string' },
            totalScraped: { type: 'integer' },
            reviews: {
              type: 'array',
              items: reviewItemSchema
            }
          }
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              businessName: { type: 'string' },
              placeUrl: { type: 'string' },
              totalScraped: { type: 'integer' },
              reviews: {
                type: 'array',
                items: reviewItemSchema
              }
            }
          }
        }
      }
    },
    400: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      }
    }
  }
};

export const scrapeFullSchema = {
  description: 'Scrape both Google Business Profile metadata and reviews (synchronous)',
  tags: ['Scraper'],
  body: {
    type: 'object',
    properties: commonInputProperties,
    examples: [
      {
        url: 'https://maps.app.goo.gl/q5Q1NgmEvVk1a86a9',
        maxReviews: 5,
        language: 'id',
        personalData: false
      }
    ]
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            profile: profileResponseSchema,
            totalReviewsScraped: { type: 'integer' },
            reviews: {
              type: 'array',
              items: reviewItemSchema
            }
          }
        },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              profile: profileResponseSchema,
              totalReviewsScraped: { type: 'integer' },
              reviews: {
                type: 'array',
                items: reviewItemSchema
              }
            }
          }
        }
      }
    },
    400: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      }
    }
  }
};

export const createJobSchema = {
  description: 'Create an asynchronous background scraping job (recommended for large review counts)',
  tags: ['Jobs'],
  body: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['profile', 'reviews', 'full'], default: 'full' },
      ...commonInputProperties
    }
  },
  response: {
    202: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        jobId: { type: 'string' },
        status: { type: 'string' },
        checkUrl: { type: 'string' },
        createdAt: { type: 'string' }
      }
    }
  }
};

export const getJobStatusSchema = {
  description: 'Check status and get results of an asynchronous scraping job',
  tags: ['Jobs'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'Job ID' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        type: { type: 'string' },
        status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed'] },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
        error: { type: 'string', nullable: true },
        result: { type: 'object', additionalProperties: true, nullable: true }
      }
    },
    404: {
      type: 'object',
      properties: {
        error: { type: 'string' }
      }
    }
  }
};
