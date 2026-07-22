import { AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import {
  ApiClientError,
  createHttpClient,
  DEFAULT_API_BASE_URL,
  isApiClientError,
} from './httpClient'

const createResponse = <T>(data: T, status = 200): AxiosResponse<T> => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config: {
    headers: new AxiosHeaders(),
  },
})

describe('httpClient', () => {
  it('parses successful ApiResponse data', async () => {
    const adapter: AxiosAdapter = async () =>
      createResponse({
        code: 0,
        message: 'success',
        data: { name: 'OA' },
      })

    const client = createHttpClient({ adapter })

    await expect(client.get<{ name: string }>('/api/user/auth/me')).resolves.toEqual({
      name: 'OA',
    })
  })

  it('throws ApiClientError when business response fails', async () => {
    const adapter: AxiosAdapter = async () =>
      createResponse({
        code: 10001,
        message: '用户名或密码错误',
        data: null,
      })

    const client = createHttpClient({ adapter })

    await expect(client.get('/api/user/auth/me')).rejects.toMatchObject({
      code: 10001,
      message: '用户名或密码错误',
    })
  })

  it('injects token and notifies unauthorized callback on 401', async () => {
    const onUnauthorized = vi.fn()
    const adapter: AxiosAdapter = async (config) => {
      expect(config.headers?.Authorization).toBe('Bearer access-token')

      return createResponse(
        {
          code: 401,
          message: '登录已失效',
          data: null,
        },
        401,
      )
    }

    const client = createHttpClient({
      adapter,
      onUnauthorized,
      tokenProvider: () => 'access-token',
    })

    await expect(client.get('/api/user/auth/me')).rejects.toBeInstanceOf(ApiClientError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('uses default base URL and normalizes network errors', async () => {
    const adapter: AxiosAdapter = async () => {
      throw new Error('Network Error')
    }

    const client = createHttpClient({ adapter })

    expect(client.defaults.baseURL).toBe(DEFAULT_API_BASE_URL)

    try {
      await client.get('/api/user/auth/me')
    } catch (error) {
      expect(isApiClientError(error)).toBe(true)
      expect(error).toMatchObject({
        code: 0,
        message: '网络异常，请稍后重试',
      })
    }
  })
})
