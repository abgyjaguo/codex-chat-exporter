# 40 - 安全与隐私：脱敏（MVP）

## 1. 目标
- 在任何数据进入 LLM / OpenNotebook 前进行脱敏（token/密钥/个人信息），降低泄漏风险。
- 默认策略：**宁可过度脱敏，也不把疑似 secrets 输出**（MVP）。

## 2. 脱敏范围（建议）
- 明显的 API keys（如 `sk-EXAMPLE_KEY_SHOULD_BE_REDACTED`）
- `Authorization: Bearer EXAMPLE_BEARER_TOKEN_SHOULD_BE_REDACTED`
- 形如 `-----BEGIN RSA PRIVATE KEY-----` / `-----BEGIN OPENSSH PRIVATE KEY-----` 的私钥块
- 常见云厂商凭证（如 `AKIAEXAMPLEACCESSKEY1`）
- Email / 手机号（可选，视使用场景）

## 3. 脱敏方式（MVP 建议）
- 规则 + 正则替换为占位符，例如：
  - `sk-EXAMPLE_KEY_SHOULD_BE_REDACTED` → `sk-***REDACTED***`
  - `Bearer EXAMPLE_BEARER_TOKEN_SHOULD_BE_REDACTED` → `Bearer ***REDACTED***`
- 保留“存在性”与大致形态（便于理解上下文），但不可复原。

## 4. 与扩展侧配置的关系
- 扩展默认不导出 tool outputs / environment context（已是较安全默认）
- Bridge 仍必须再做一次脱敏（不要信任上游）

## 5. 验收标准（MVP）
- [ ] 脱敏规则覆盖上述范围，并有最少的单元测试样例（后续实现时补）
- [ ] 任何同步到 OpenNotebook 的文本不包含明显 secrets（抽检）
