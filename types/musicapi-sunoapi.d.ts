// types/musicapi-sunoapi.d.ts

/**
 * Suno API 的类型声明文件
 * 为 @musicapi/sunoapi 模块提供 TypeScript 类型支持
 * 根据实际测试的 API 格式：https://api.sunoapi.org/api/v1/generate
 */

declare module '@musicapi/sunoapi' {
  // ========== 创建音乐请求参数 ==========
  export interface CreateMusicParams {
    /**
     * 模式: true=自定义模式(提供歌词), false=灵感模式
     * @default false
     */
    customMode?: boolean;
    
    /**
     * 是否纯音乐（无歌声）
     * @default true
     */
    instrumental?: boolean;
    
    /**
     * 模型版本
     * @default "V4_5ALL"
     */
    model?: string;
    
    /**
     * 回调 URL - 必填！音乐生成完成后会 POST 到这个地址
     * @example "https://your-domain.com/api/suno/callback"
     */
    callBackUrl: string;
    
    /**
     * 歌词或音乐描述
     * - 纯音乐模式：描述音乐氛围（如 "A peaceful ambient music"）
     * - 歌曲模式：歌词内容
     */
    prompt?: string;
    
    /**
     * 风格标签
     * @example "ambient", "classical", "pop, rock"
     */
    style?: string;
    
    /**
     * 歌曲标题
     * @default "Untitled"
     */
    title?: string;
    
    /**
     * 人物ID（可选）
     */
    personaId?: string;
    
    /**
     * 人物模型（可选）
     */
    personaModel?: string;
    
    /**
     * 负面标签，避免的风格（可选）
     * @example "Heavy Metal, Upbeat Drums"
     */
    negativeTags?: string;
    
    /**
     * 人声性别（可选）
     * - "m": 男声
     * - "f": 女声
     */
    vocalGender?: string;
    
    /**
     * 风格权重（可选）
     */
    styleWeight?: number;
    
    /**
     * 怪异度约束（可选）
     */
    weirdnessConstraint?: number;
    
    /**
     * 音频权重（可选）
     */
    audioWeight?: number;
  }

  // ========== 创建音乐响应 ==========
  export interface CreateMusicResponse {
    /**
     * 状态码
     * - 200: 成功
     * - 400: 参数错误
     * - 401: 认证失败
     * - 500: 服务器错误
     */
    code: number;
    
    /**
     * 响应消息
     */
    msg: string;
    
    /**
     * 响应数据
     */
    data: {
      /**
       * 任务ID，用于后续查询结果
       */
      taskId: string;
    } | null;
  }

  // ========== 音乐数据 ==========
  export interface MusicData {
    /**
     * 任务ID
     */
    taskId: string;
    
    /**
     * 任务状态
     * - SUBMITTED: 已提交
     * - QUEUED: 排队中
     * - PROCESSING: 处理中
     * - SUCCESS: 成功
     * - FAILED: 失败
     */
    status: string;
    
    /**
     * 歌曲标题
     */
    title?: string;
    
    /**
     * 风格标签
     */
    style?: string;
    
    /**
     * 音频URL（当status为SUCCESS时提供）
     */
    audioUrl?: string;
    
    /**
     * 封面图片URL
     */
    imageUrl?: string;
    
    /**
     * 歌词或描述
     */
    prompt?: string;
    
    /**
     * 模型版本
     */
    model?: string;
    
    /**
     * 错误信息（如果失败）
     */
    errorMessage?: string;
    
    /**
     * 创建时间
     */
    createdAt?: string;
    
    /**
     * 完成时间
     */
    finishedAt?: string;
    
    // 允许其他未定义的字段
    [key: string]: any;
  }

  // ========== 查询音乐响应 ==========
  export interface FetchMusicResponse {
    /**
     * 状态码
     */
    code: number;
    
    /**
     * 响应消息
     */
    msg: string;
    
    /**
     * 音乐数据
     */
    data: MusicData | MusicData[] | null;
  }

  // ========== SunoAPI 类 ==========
  export default class SunoAPI {
    /**
     * 创建 SunoAPI 实例
     * @param config 配置对象
     * @param config.apiKey API密钥
     * @param config.baseUrl API基础URL
     * @param config.timeout 超时时间（毫秒，可选）
     * @param config.maxRetries 最大重试次数（可选）
     */
    constructor(config: {
      apiKey: string;
      baseUrl: string;
      timeout?: number;
      maxRetries?: number;
    });

    /**
     * 创建音乐生成任务
     * @param params 生成参数
     * @returns 返回任务信息
     */
    createMusic(params: CreateMusicParams): Promise<CreateMusicResponse>;

    /**
     * 查询音乐生成结果
     * @param taskId 任务ID
     * @returns 返回音乐数据
     */
    getMusic(taskId: string): Promise<FetchMusicResponse>;

    /**
     * 获取音乐列表（某些版本可能支持）
     * @param page 页码
     * @param pageSize 每页数量
     */
    getMusicList?(page?: number, pageSize?: number): Promise<any>;
  }
}