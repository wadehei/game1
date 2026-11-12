/** API 源（跨域部署时经 VITE_API_BASE_URL 指定，如 https://other-host）；空串=同源。
 *  独立成零依赖模块：错误上报等"最后一道防线"路径也要能取到它，不拖入 axios */
export const API_ORIGIN: string = import.meta.env.VITE_API_BASE_URL || '';
