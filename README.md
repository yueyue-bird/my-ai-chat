app文件为这个项目的主目录：
    其中的api/chat文件夹为API路由目录：
        其中的suno文件夹是Suno音乐生成的文件夹：
            其中fetch文件夹是查询音乐接口，generate文件夹是生成音乐接口，save-to-blob是保存音乐的文件夹。
    其中的generate文件夹是音乐生成器界面
    其中page.tsx为首页
util文件夹为工具函数目录
    其中的sunoClient.ts是Suno API客户端（核心）
types文件夹是TypeScript类型声明
    其中的musicapi-sunoapi.d.ts是Suno API 的类型声明文件
.env.local是环境变量文件（包含API密钥）
其余为配置文件
