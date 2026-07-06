import { tz } from '@date-fns/tz';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import logger from '../utils/infra/logger';
import { CatStatusAPIResponse } from './types/catStatus';

export namespace CatStatus {
  const SINGAPORE_TIME_ZONE = 'Asia/Singapore';
  const TIMEOUT_MS = 5_000;
  const MAX_RETRIES = 2;
  const BASE_KNOCKOFF_MS = 300;

  const CAT_STATUS_API_BASE_URL = 'https://api.andewmole.com/cat1';

  function requestConfig() {
    return {
      timeout: TIMEOUT_MS,
    };
  }

  axiosRetry(axios, {
    retries: MAX_RETRIES,
    retryCondition: (error) => isRetryableWeatherError(error),
    retryDelay: (retryCount, error) => {
      const retryAfterHeader = error.response?.headers?.['retry-after'];
      const retryAfterSeconds = Number(retryAfterHeader);

      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1_000;
      }

      const jitter = Math.floor(Math.random() * 100);
      return BASE_KNOCKOFF_MS * Math.pow(2, retryCount - 1) + jitter;
    },
    onRetry: (retryCount, error, requestConfig) => {
      logger.warn(
        `Retrying data.gov request to ${requestConfig.url ?? 'unknown url'} (attempt ${retryCount}/${MAX_RETRIES}) after transient error: ${error.message}`,
      );
    },
  });

  function isRetryableWeatherError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }

  async function requestCatStatusAPI(
    url: string,
  ): Promise<CatStatusAPIResponse> {
    try {
      const response = await axios.get<CatStatusAPIResponse>(
        url,
        requestConfig(),
      );
      return response.data;
    } catch (error) {
      logger.error(`Error fetching CAT Status data:`, error);
      throw error;
    }
  }

  export function formatDate(date: Date): string {
    return format(date, 'd MMMM yyyy HH:mm');
  }

  export function parseCATStatus(startDate: Date, catStatus: string) {
    switch (catStatus) {
      case '3':
        return {
          emoji: '🟢',
          catText: 'CAT 3',
        };

      case '2':
        return {
          emoji: '🟡',
          catText: 'CAT 2',
        };

      case '1':
        if (startDate > new Date()) {
          return {
            emoji: '🟠',
            catText: 'CAT 1 (Incoming)',
          };
        }

        return {
          emoji: '🔴',
          catText: 'CAT 1',
        };

      default:
        return {
          emoji: '',
          catText: catStatus,
        };
    }
  }

  export namespace Defaults {
    export const CDA = {
      latitude: 1.3659363,
      longitude: 103.6898665,
      name: 'Civil Defence Academy',
      shortName: 'CDA',
    };

    export const HTTC = {
      latitude: 1.4063182,
      longitude: 103.759932,
      name: 'Home Team Tactical Centre',
      shortName: 'HTTC',
    };
  }

  export namespace API {
    export async function getCatStatusFor(location: 'CDA' | 'HTTC') {
      let str = '';

      switch (location) {
        case 'CDA':
          str = `/getCATInfo?lat=${Defaults.CDA.latitude}&long=${Defaults.CDA.longitude}`;
          break;
        case 'HTTC':
          str = `/getCATInfo?lat=${Defaults.HTTC.latitude}&long=${Defaults.HTTC.longitude}`;
          break;
      }

      const response = await requestCatStatusAPI(CAT_STATUS_API_BASE_URL + str);

      if (!response.data) {
        console.log('Error getting CAT Status API');
        throw new Error('Error getting CAT Status API');
      }

      if (!response.data.armysectors) {
        console.log('No army sectors found');
        throw new Error('No army sectors found');
      }

      console.log('Get CAT Status API');
      console.log(response.data);

      const sector = response.data.armysectors;

      const data = sector.weather;

      return data;
    }
  }
}
