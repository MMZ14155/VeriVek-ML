"""AI 助手服务：调用 OpenAI 兼容格式的 LLM API 辅助模型架构设计。"""
from typing import Dict, List, Optional, Any
import os

try:
    import openai
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "请安装 openai 包以使用 AI 助手功能: pip install openai"
    ) from exc


class AIAssistantService:
    """提供架构设计对话能力，支持 OpenAI/Anthropic/Google/自定义等兼容端点。"""

    # 内置 provider 默认地址与模型
    PROVIDER_DEFAULTS: Dict[str, Dict[str, str]] = {
        "deepseek": {
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-v4-flash",
        },
        "custom": {
            "base_url": "",
            "model": "",
        },
    }

    def __init__(
        self,
        api_key: str,
        provider: str = "deepseek",
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        default_system_prompt: Optional[str] = None,
    ):
        if not api_key:
            raise ValueError("API Key 不能为空")

        self.api_key = api_key
        self.provider = provider.lower().strip()
        self.base_url = base_url or self._default_base_url(self.provider)
        self.model = model or self._default_model(self.provider)
        self.default_system_prompt = default_system_prompt or self._build_system_prompt()

        self._client = openai.OpenAI(api_key=api_key, base_url=self.base_url)

    @classmethod
    def _default_base_url(cls, provider: str) -> str:
        if provider in cls.PROVIDER_DEFAULTS:
            return cls.PROVIDER_DEFAULTS[provider]["base_url"]
        return "https://api.deepseek.com/v1"

    @classmethod
    def _default_model(cls, provider: str) -> str:
        if provider in cls.PROVIDER_DEFAULTS:
            return cls.PROVIDER_DEFAULTS[provider]["model"]
        return "deepseek-v4-flash"

    @staticmethod
    def _build_system_prompt() -> str:
        return (
            "你是 VeriVek 模型架构设计助手，擅长 PyTorch 深度学习模型设计。\n"
            "你可以帮助用户：\n"
            "1. 解释当前模型架构图中的组件含义和作用；\n"
            "2. 根据用户目标（如提升准确率、减少参数量、加快推理）给出优化建议；\n"
            "3. 指出当前架构可能存在的问题（如维度不匹配、缺少激活函数、过度降采样等）；\n"
            "4. 推荐更适合的层或结构（如 Residual、Attention、BatchNorm 位置等）；\n"
            "5. 将模型代码转换为可视化图结构或解释代码逻辑。\n\n"
            "请保持回答简洁、专业，优先给出可落地的建议。\n"
            "如果用户提供了架构图结构或代码，请先分析它们，再回答问题。"
        )

    def _build_context_message(
        self,
        graph_structure: Optional[Dict[str, Any]] = None,
        current_code: Optional[str] = None,
        task: Optional[str] = None,
    ) -> str:
        """根据当前架构图/代码构建上下文消息。"""
        parts: List[str] = []

        if task:
            parts.append(f"用户意图：{task}")

        if graph_structure:
            nodes = graph_structure.get("nodes", [])
            connections = graph_structure.get("connections", [])
            parts.append(
                f"当前架构图包含 {len(nodes)} 个节点，{len(connections)} 条连接。"
            )
            if nodes:
                node_summary = "\n".join(
                    f"- {n.get('type', 'Unknown')}"
                    for n in nodes
                )
                parts.append("节点列表：\n" + node_summary)
            if connections:
                conn_summary = "\n".join(
                    f"- {c['from']['nodeId']} -> {c['to']['nodeId']}"
                    for c in connections
                )
                parts.append("连接关系：\n" + conn_summary)

        if current_code:
            parts.append("当前 PyTorch 代码：\n```python\n" + current_code + "\n```")

        if not parts:
            return ""
        return "\n\n".join(parts)

    def chat(
        self,
        messages: List[Dict[str, str]],
        graph_structure: Optional[Dict[str, Any]] = None,
        current_code: Optional[str] = None,
        task: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> Dict[str, Any]:
        """
        与 LLM 进行对话，返回 AI 回复。

        Args:
            messages: 用户消息历史，每个消息包含 role 和 content
            graph_structure: 可选，当前架构图结构
            current_code: 可选，当前 PyTorch 代码
            task: 可选，任务类型（如 explain/optimize/suggest）
            temperature: 采样温度
            max_tokens: 最大 token 数
        """
        context = self._build_context_message(graph_structure, current_code, task)

        chat_messages: List[Dict[str, str]] = [
            {"role": "system", "content": self.default_system_prompt}
        ]
        if context:
            chat_messages.append({"role": "system", "content": context})

        # 过滤并追加用户历史消息
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if content:
                chat_messages.append({"role": role, "content": content})

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=chat_messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            reply = response.choices[0].message.content
            return {
                "success": True,
                "reply": reply,
                "model": self.model,
                "usage": response.usage.to_dict() if response.usage else None,
            }
        except openai.AuthenticationError as e:
            return {"success": False, "error": f"API Key 验证失败: {e.body.get('message', str(e)) if e.body else str(e)}"}
        except openai.APIConnectionError as e:
            return {"success": False, "error": f"无法连接到 API: {str(e)}"}
        except openai.RateLimitError as e:
            return {"success": False, "error": f"请求频率超限: {e.body.get('message', str(e)) if e.body else str(e)}"}
        except openai.APIError as e:
            return {"success": False, "error": f"LLM API 错误: {e.body.get('message', str(e)) if e.body else str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"调用 AI 服务失败: {str(e)}"}

    def explain_architecture(
        self,
        graph_structure: Dict[str, Any],
        current_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """解释当前架构。"""
        return self.chat(
            messages=[{"role": "user", "content": "请解释当前模型架构的设计思路、各层作用以及数据流。"}],
            graph_structure=graph_structure,
            current_code=current_code,
            task="explain",
        )

    def suggest_optimization(
        self,
        graph_structure: Dict[str, Any],
        current_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """给出优化建议。"""
        return self.chat(
            messages=[{"role": "user", "content": "请分析当前模型架构，并给出优化建议以提升性能或减少参数量。"}],
            graph_structure=graph_structure,
            current_code=current_code,
            task="optimize",
        )