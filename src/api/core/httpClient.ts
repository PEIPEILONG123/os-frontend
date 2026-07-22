import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { ApiResponse } from '../../types/api'

export const DEFAULT_API_BASE_URL = 'http://localhost:8088'

const SUCCESS_CODES = new Set([0, 200])
const UNAUTHORIZED_CODE = 401
const NETWORK_ERROR_CODE = 0

export type TokenProvider = () => string | null | undefined
export type UnauthorizedHandler = () => void

export interface CreateHttpClientOptions {
  adapter?: AxiosAdapter
  baseURL?: string
  onUnauthorized?: UnauthorizedHandler
  tokenProvider?: TokenProvider
}

export interface HttpClient {
  defaults: AxiosInstance['defaults']
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig): Promise<T>
  put<T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig): Promise<T>
}

export class ApiClientError extends Error {
  readonly code: number
  readonly httpStatus?: number
  readonly raw?: unknown

  constructor(message: string, code: number, httpStatus?: number, raw?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.httpStatus = httpStatus
    this.raw = raw
  }
}

export const isApiClientError = (error: unknown): error is ApiClientError =>
  error instanceof ApiClientError

const resolveApiBaseUrl = (baseURL?: string): string => {
  const configuredBaseURL = baseURL ?? import.meta.env.VITE_API_BASE_URL

  return configuredBaseURL?.trim() || DEFAULT_API_BASE_URL
}

const isApiResponse = <T>(value: unknown): value is ApiResponse<T> => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const response = value as Partial<ApiResponse<T>>

  return typeof response.code === 'number' && typeof response.message === 'string' && 'data' in response
}

const normalizeApiResponse = <T>(
  response: AxiosResponse<ApiResponse<T>>,
  onUnauthorized?: UnauthorizedHandler,
): T => {
  const responseBody = response.data

  if (!isApiResponse<T>(responseBody)) {
    throw new ApiClientError('接口响应格式错误', response.status, response.status, responseBody)
  }

  if (SUCCESS_CODES.has(responseBody.code)) {
    return responseBody.data
  }

  if (responseBody.code === UNAUTHORIZED_CODE || response.status === UNAUTHORIZED_CODE) {
    onUnauthorized?.()
  }

  throw new ApiClientError(responseBody.message, responseBody.code, response.status, responseBody)
}

const normalizeRequestError = (error: unknown, onUnauthorized?: UnauthorizedHandler): ApiClientError => {
  if (isApiClientError(error)) {
    return error
  }

  if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
    const status = error.response?.status
    const responseBody = error.response?.data

    if (status === UNAUTHORIZED_CODE) {
      onUnauthorized?.()
    }

    if (isApiResponse<unknown>(responseBody)) {
      return new ApiClientError(responseBody.message, responseBody.code, status, responseBody)
    }

    return new ApiClientError(error.message || '请求失败', status ?? NETWORK_ERROR_CODE, status, responseBody)
  }

  return new ApiClientError('网络异常，请稍后重试', NETWORK_ERROR_CODE, undefined, error)
}

const injectToken = (
  config: InternalAxiosRequestConfig,
  tokenProvider?: TokenProvider,
): InternalAxiosRequestConfig => {
  const token = tokenProvider?.()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
}

export const createHttpClient = (options: CreateHttpClientOptions = {}): HttpClient => {
  const axiosInstance = axios.create({
    adapter: options.adapter,
    baseURL: resolveApiBaseUrl(options.baseURL),
    timeout: 10000,
  })

  axiosInstance.interceptors.request.use((config) => injectToken(config, options.tokenProvider))

  const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
    try {
      const response = await axiosInstance.request<ApiResponse<T>>(config)

      return normalizeApiResponse<T>(response, options.onUnauthorized)
    } catch (error) {
      throw normalizeRequestError(error, options.onUnauthorized)
    }
  }

  return {
    defaults: axiosInstance.defaults,
    delete: <T>(url: string, config?: AxiosRequestConfig) =>
      request<T>({
        ...config,
        method: 'DELETE',
        url,
      }),
    get: <T>(url: string, config?: AxiosRequestConfig) =>
      request<T>({
        ...config,
        method: 'GET',
        url,
      }),
    post: <T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig) =>
      request<T>({
        ...config,
        data,
        method: 'POST',
        url,
      }),
    put: <T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig) =>
      request<T>({
        ...config,
        data,
        method: 'PUT',
        url,
      }),
  }
}

export const httpClient = createHttpClient()
