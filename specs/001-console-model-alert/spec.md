# Feature Specification: Claude Console Model Alert

**Feature Branch**: `001-console-model-alert`
**Created**: 2026-01-05
**Status**: Draft
**Input**: User description: "对于claude console帐号，请检查响应返回的模型，如果不是claude模型需要webhook告警，告警信息包含当前请求的api key，处理请求的帐号信息。claude有haiku，sonnet，opus三类模型。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect Non-Claude Model Response (Priority: P1)

作为系统管理员，我希望系统能自动检测Claude Console账户的API响应中返回的模型名称，当模型不属于Claude系列（haiku、sonnet、opus）时，系统应立即发送webhook告警通知，以便我及时发现账户异常或上游服务问题。

**Why this priority**: 这是核心功能，直接关系到账户安全和服务质量监控。非Claude模型响应可能表示账户被劫持、上游服务配置错误或其他安全问题。

**Independent Test**: 可以通过模拟一个返回非Claude模型名称的响应来独立测试，验证系统是否正确识别并触发告警。

**Acceptance Scenarios**:

1. **Given** Claude Console账户正在处理API请求，**When** 响应中的模型名称包含"haiku"、"sonnet"或"opus"（如"claude-haiku-4-5-20251001"），**Then** 系统正常处理响应，不触发告警
2. **Given** Claude Console账户正在处理API请求，**When** 响应中的模型名称不包含"haiku"、"sonnet"或"opus"（如"gpt-4"、"MiniMax"、"glm"或"unknown-model"），**Then** 系统立即发送webhook告警
3. **Given** Claude Console账户正在处理API请求，**When** 响应中没有模型字段或模型字段为空，**Then** 系统发送webhook告警

---

### User Story 2 - Webhook Alert with Context Information (Priority: P1)

作为系统管理员，当收到模型异常告警时，我需要获得完整的上下文信息，包括请求使用的API Key和处理该请求的Console账户信息，以便快速定位问题。

**Why this priority**: 告警信息的完整性决定了问题排查的效率，与检测功能同等重要。

**Independent Test**: 可以通过触发告警并检查webhook负载内容来验证所有必要信息是否包含。

**Acceptance Scenarios**:

1. **Given** 系统检测到非Claude模型响应，**When** 发送webhook告警，**Then** 告警信息包含当前请求的API Key Name（方便识别）
2. **Given** 系统检测到非Claude模型响应，**When** 发送webhook告警，**Then** 告警信息包含处理请求的Console账户ID和名称
3. **Given** 系统检测到非Claude模型响应，**When** 发送webhook告警，**Then** 告警信息包含检测到的异常模型名称
4. **Given** 系统检测到非Claude模型响应，**When** 发送webhook告警，**Then** 告警信息包含事件发生的时间戳

---

### User Story 3 - Alert Rate Limiting (Priority: P2)

作为系统管理员，我不希望在短时间内收到大量重复告警导致告警疲劳，系统应对同一账户的重复告警进行频率限制。

**Why this priority**: 防止告警风暴是告警系统的基本要求，但相对于核心检测功能优先级较低。

**Independent Test**: 可以通过在短时间内多次触发同一账户的异常，验证是否只收到限定次数的告警。

**Acceptance Scenarios**:

1. **Given** 同一Console账户在1分钟内多次触发模型异常，**When** 系统处理这些异常，**Then** 系统最多发送1次webhook告警
2. **Given** Console账户A触发告警后1分钟内，**When** Console账户B也触发模型异常，**Then** 账户B的告警正常发送，不受A的限流影响
3. **Given** Console账户触发告警后超过1分钟，**When** 同一账户再次触发模型异常，**Then** 系统正常发送新的告警

---

### User Story 4 - Feature Toggle Control (Priority: P2)

作为系统管理员，我希望能够通过配置开关控制模型告警检测功能的启用或禁用，以便在需要时临时关闭告警或进行维护。

**Why this priority**: 功能开关是运维灵活性的基本要求，但相对于核心检测功能优先级较低。

**Independent Test**: 可以通过修改配置开关验证功能是否正确启用/禁用。

**Acceptance Scenarios**:

1. **Given** 功能开关为开启状态（默认），**When** Claude Console账户响应返回非Claude模型，**Then** 系统正常触发webhook告警
2. **Given** 功能开关为关闭状态，**When** Claude Console账户响应返回非Claude模型，**Then** 系统不进行模型检测，不触发任何告警
3. **Given** 管理员修改功能开关状态，**When** 配置生效后，**Then** 后续请求按新配置执行

---

### Edge Cases

- 响应中模型名称包含Claude变体但格式不标准（如大小写混合"Claude-Sonnet"）？系统应不区分大小写进行匹配
- 流式响应中如何检测模型信息？应在流结束时的usage数据或message_stop事件中检测
- webhook发送失败时如何处理？应记录到日志并在下次告警时重试
- 响应解析失败或格式异常时？应记录警告日志但不阻塞正常业务流程
- 请求失败（如网络错误、上游服务错误）？排除在检测范围外，不触发模型检测
- 功能开关状态变更时正在处理的请求？按请求开始时的开关状态执行，保持一致性

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须在处理Claude Console账户的API响应时，提取并验证响应中的模型名称
- **FR-002**: 系统必须识别Claude模型系列，包括所有包含"haiku"、"sonnet"或"opus"关键字的模型名称（不区分大小写）
- **FR-003**: 当响应模型不属于Claude系列时，系统必须触发webhook告警
- **FR-004**: 告警信息必须包含：请求API Key Name（方便识别，Key ID可选）、Console账户ID、Console账户名称、异常模型名称、事件时间戳
- **FR-005**: 系统必须对同一账户的告警实施频率限制，同一账户在1分钟内最多触发1次告警
- **FR-006**: 系统必须支持通过现有的webhook配置发送告警通知
- **FR-007**: 当响应中缺少模型字段或模型字段为空/null时，系统必须视为异常并触发告警
- **FR-008**: 系统必须同时支持流式和非流式响应的模型检测
- **FR-009**: 系统仅在请求成功（有正常响应）时进行模型检测，请求失败场景排除在检测范围外
- **FR-010**: 系统必须提供功能开关配置，允许管理员启用或禁用模型告警检测功能，默认为开启状态

### Key Entities

- **ModelAlertEvent**: 模型异常告警事件，包含apiKeyName、apiKeyId（可选）、accountId、accountName、detectedModel、expectedModels、timestamp
- **AlertRateLimit**: 告警频率限制状态，包含accountId、lastAlertTime、用于控制同一账户的告警频率

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 系统能够在响应返回后100ms内完成模型验证和告警触发判断
- **SC-002**: 100%的非Claude模型响应能够被正确识别并触发告警
- **SC-003**: 告警信息100%包含所有必要的上下文字段（API Key、账户信息、异常模型名称、时间戳）
- **SC-004**: 同一账户在1分钟内的重复告警被成功抑制，抑制率100%
- **SC-005**: webhook告警发送成功率达到99%以上（在网络正常情况下）

## Clarifications

### Session 2026-01-05

- Q: API Key在告警中如何标识？ → A: 使用API Key Name（方便识别），Key ID可选包含
- Q: 请求失败时是否检测模型？ → A: 排除，请求失败不包含模型信息，不触发检测
- Q: 功能是否支持开关控制？ → A: 支持开关，默认开启

## Assumptions

- 现有的webhookService和webhookConfigService可用于发送告警通知
- Claude Console账户的响应格式与Claude官方API响应格式一致，模型信息位于响应的model字段
- API Key脱敏策略使用现有的tokenMask工具
- 告警频率限制使用Redis存储，与现有基础设施一致
- Claude模型名称格式遵循Anthropic的命名规范，如"claude-3-5-sonnet-20241022"、"claude-3-haiku-20240307"等
