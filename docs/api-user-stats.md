# API 接口文档：用户统计查询

## 接口信息

**接口名称**: 用户 API Key 统计查询接口
**接口路径**: `/apiStats/api/user-stats`
**请求方法**: `POST`
**Content-Type**: `application/json`
**接口说明**: 安全的自查询接口，用户可以通过 API Key 或 API ID 查询自己的使用统计和配额信息

---

## 请求参数

### Body 参数 (JSON)

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `apiKey` | String | 二选一 | API Key 完整字符串（cr\_ 开头） |
| `apiId` | String | 二选一 | API Key 的 UUID 标识符 |

**注意**: `apiKey` 和 `apiId` 必须提供其中一个，不能同时为空。

### 请求示例

#### 使用 API Key 查询

```json
{
  "apiKey": "cr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

#### 使用 API ID 查询

```json
{
  "apiId": "12345678-1234-1234-1234-123456789abc"
}
```

---

## 响应数据

### 成功响应 (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "12345678-1234-1234-1234-123456789abc",
    "name": "我的 API Key",
    "description": "API Key 描述信息",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2025-01-01T00:00:00.000Z",
    "expirationMode": "fixed",
    "isActivated": true,
    "activationDays": 30,
    "activatedAt": "2024-01-01T00:00:00.000Z",
    "permissions": "all",

    "usage": {
      "total": {
        "requests": 1000,
        "tokens": 500000,
        "allTokens": 500000,
        "inputTokens": 300000,
        "outputTokens": 200000,
        "cacheCreateTokens": 50000,
        "cacheReadTokens": 25000,
        "cost": 5.75,
        "formattedCost": "$5.750000"
      }
    },

    "limits": {
      "tokenLimit": 1000000,
      "concurrencyLimit": 5,
      "rateLimitWindow": 60,
      "rateLimitRequests": 100,
      "rateLimitCost": 10.0,
      "dailyCostLimit": 50.0,
      "totalCostLimit": 1000.0,
      "weeklyOpusCostLimit": 100.0,
      "weeklyCostLimit": 200.0,

      "currentWindowRequests": 10,
      "currentWindowTokens": 5000,
      "currentWindowCost": 0.05,
      "currentDailyCost": 2.5,
      "currentTotalCost": 5.75,
      "weeklyOpusCost": 15.0,
      "weeklyCost": 30.0,
      "weeklyStartTime": "2024-01-01T00:00:00.000Z",
      "weeklyResetTime": "2024-01-08T00:00:00.000Z",
      "isWeeklyCostActive": true,
      "weeklyRemaining": 170.0,
      "weeklyUsagePercentage": 15.0,

      "windowStartTime": 1704067200000,
      "windowEndTime": 1704070800000,
      "windowRemainingSeconds": 3540
    },

    "accounts": {
      "claudeAccountId": "claude-account-uuid",
      "geminiAccountId": null,
      "openaiAccountId": "openai-account-uuid",
      "details": {
        "claude": {
          "id": "claude-account-uuid",
          "name": "Claude 专用账户",
          "accountType": "dedicated"
        },
        "openai": {
          "id": "openai-account-uuid",
          "name": "OpenAI 专用账户",
          "accountType": "dedicated"
        }
      }
    },

    "restrictions": {
      "enableModelRestriction": true,
      "restrictedModels": [
        "claude-opus-4-20250514",
        "gpt-4"
      ],
      "enableClientRestriction": false,
      "allowedClients": []
    }
  }
}
```

---

## 响应字段说明

### 基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String | API Key 的唯一标识符 (UUID) |
| `name` | String | API Key 名称 |
| `description` | String | API Key 描述 |
| `isActive` | Boolean | 是否激活（能通过查询说明一定为 true） |
| `createdAt` | String (ISO) | 创建时间 |
| `expiresAt` | String (ISO) | 过期时间 |
| `expirationMode` | String | 过期模式：`fixed`（固定时间）或 `activation`（激活后计时） |
| `isActivated` | Boolean | 是否已激活（仅 activation 模式） |
| `activationDays` | Number | 激活后有效天数 |
| `activatedAt` | String (ISO) | 激活时间 |
| `permissions` | String | 权限类型：`all`、`claude`、`gemini`、`openai` 等 |

### 使用统计 (usage.total)

| 字段 | 类型 | 说明 |
|------|------|------|
| `requests` | Number | 总请求次数 |
| `tokens` | Number | 总 Token 数（等同于 allTokens） |
| `allTokens` | Number | 所有 Token 总数 |
| `inputTokens` | Number | 输入 Token 数 |
| `outputTokens` | Number | 输出 Token 数 |
| `cacheCreateTokens` | Number | 缓存创建 Token 数 |
| `cacheReadTokens` | Number | 缓存读取 Token 数 |
| `cost` | Number | 总费用（美元） |
| `formattedCost` | String | 格式化的费用字符串 |

### 限制信息 (limits)

#### 配置限制

| 字段 | 类型 | 说明 |
|------|------|------|
| `tokenLimit` | Number | Token 总限制 |
| `concurrencyLimit` | Number | 并发请求限制 |
| `rateLimitWindow` | Number | 速率限制窗口（分钟） |
| `rateLimitRequests` | Number | 窗口内最大请求数 |
| `rateLimitCost` | Number | 窗口内最大费用（美元） |
| `dailyCostLimit` | Number | 每日费用限制（美元） |
| `totalCostLimit` | Number | 总费用限制（美元） |
| `weeklyOpusCostLimit` | Number | 每周 Opus 模型费用限制（美元） |
| `weeklyCostLimit` | Number | 每周总费用限制（美元） |

#### 当前使用量

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentWindowRequests` | Number | 当前窗口请求数 |
| `currentWindowTokens` | Number | 当前窗口 Token 数 |
| `currentWindowCost` | Number | 当前窗口费用（美元） |
| `currentDailyCost` | Number | 当天费用（美元） |
| `currentTotalCost` | Number | 总费用（美元） |
| `weeklyOpusCost` | Number | 本周 Opus 模型费用（美元） |
| `weeklyCost` | Number | 本周总费用（美元） |

#### 周限制详细信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `weeklyStartTime` | String (ISO) | 周期开始时间（7天滚动窗口的起点） |
| `weeklyResetTime` | String (ISO) | 周期重置时间（下次重置的时间点） |
| `isWeeklyCostActive` | Boolean | 周限制是否已激活（是否有使用记录） |
| `weeklyRemaining` | Number | 剩余可用周额度（美元） |
| `weeklyUsagePercentage` | Number | 周使用百分比（0-100） |

#### 时间窗口信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `windowStartTime` | Number | 窗口开始时间（Unix 时间戳毫秒） |
| `windowEndTime` | Number | 窗口结束时间（Unix 时间戳毫秒） |
| `windowRemainingSeconds` | Number | 窗口剩余秒数 |

### 绑定账户信息 (accounts)

| 字段 | 类型 | 说明 |
|------|------|------|
| `claudeAccountId` | String \| null | 绑定的 Claude 账户 ID |
| `geminiAccountId` | String \| null | 绑定的 Gemini 账户 ID |
| `openaiAccountId` | String \| null | 绑定的 OpenAI 账户 ID |
| `details` | Object \| null | 专用账户详细信息（仅 dedicated 类型账户） |

### 访问限制 (restrictions)

| 字段 | 类型 | 说明 |
|------|------|------|
| `enableModelRestriction` | Boolean | 是否启用模型黑名单 |
| `restrictedModels` | Array&lt;String&gt; | 禁止访问的模型列表 |
| `enableClientRestriction` | Boolean | 是否启用客户端限制 |
| `allowedClients` | Array&lt;String&gt; | 允许的客户端列表 |

---

## 错误响应

### 400 Bad Request - 参数错误

```json
{
  "error": "API Key or ID is required",
  "message": "Please provide your API Key or API ID"
}
```

```json
{
  "error": "Invalid API ID format",
  "message": "API ID must be a valid UUID"
}
```

### 401 Unauthorized - API Key 无效

```json
{
  "error": "Invalid API key",
  "message": "API key not found"
}
```

### 403 Forbidden - API Key 被禁用或过期

```json
{
  "error": "API key is disabled",
  "message": "This API key has been disabled"
}
```

```json
{
  "error": "API key has expired",
  "message": "This API key has expired"
}
```

### 404 Not Found - API Key 不存在

```json
{
  "error": "API key not found",
  "message": "The specified API key does not exist"
}
```

### 500 Internal Server Error - 服务器错误

```json
{
  "error": "Internal server error",
  "message": "Failed to retrieve API key statistics"
}
```

---

## 使用示例

### cURL 示例

```bash
# 使用 API Key 查询
curl -X POST https://your-domain.com/apiStats/api/user-stats \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "cr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'

# 使用 API ID 查询
curl -X POST https://your-domain.com/apiStats/api/user-stats \
  -H "Content-Type: application/json" \
  -d '{"apiId": "12345678-1234-1234-1234-123456789abc"}'
```

### JavaScript (Fetch) 示例

```javascript
// 使用 API Key 查询
const response = await fetch('https://your-domain.com/apiStats/api/user-stats', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    apiKey: 'cr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  })
});

const data = await response.json();
console.log(data);
```

### Python 示例

```python
import requests

# 使用 API ID 查询
url = 'https://your-domain.com/apiStats/api/user-stats'
payload = {
    'apiId': '12345678-1234-1234-1234-123456789abc'
}
headers = {
    'Content-Type': 'application/json'
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print(data)
```

### Go 示例

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

type UserStatsRequest struct {
    ApiID string `json:"apiId"`
}

type UserStatsResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data"`
}

func main() {
    url := "https://your-domain.com/apiStats/api/user-stats"

    requestBody := UserStatsRequest{
        ApiID: "12345678-1234-1234-1234-123456789abc",
    }

    jsonData, _ := json.Marshal(requestBody)

    resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)

    var result UserStatsResponse
    json.Unmarshal(body, &result)

    fmt.Printf("%+v\n", result)
}
```

### Java 示例

```java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.json.JSONObject;

public class UserStatsExample {
    public static void main(String[] args) throws Exception {
        String url = "https://your-domain.com/apiStats/api/user-stats";

        JSONObject requestBody = new JSONObject();
        requestBody.put("apiId", "12345678-1234-1234-1234-123456789abc");

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(requestBody.toString()))
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());

        System.out.println(response.body());
    }
}
```

---

## 注意事项

1. **安全性**: 此接口仅返回查询者自己的 API Key 信息，不会泄露其他用户数据
2. **推荐使用 apiId**: 相比传输完整的 API Key，使用 apiId 更安全
3. **激活检查**: 只有激活且未过期的 API Key 才能成功查询
4. **费用计算**: 所有费用按模型实际价格计算，详见 `pricingService`
5. **时区**: 所有时间字段均为 UTC 时区的 ISO 格式字符串
6. **窗口重置**: 速率限制窗口过期后，计数器会在下次请求时自动重置
7. **周限制逻辑**:
   - `weeklyCost` 统计最近 7 天滚动窗口的费用
   - `weeklyStartTime` 显示当前 7 天窗口的开始时间
   - `weeklyResetTime` 显示下次重置时间（周期起点 + 7 天）
   - `isWeeklyCostActive` 为 `true` 表示已有使用记录
   - 周期时长固定为 7 天（168 小时），滚动更新
8. **专用账户**: 只有绑定了 `dedicated` 类型账户的 API Key，`accounts.details` 才会有数据
9. **限流保护**: 建议合理控制查询频率，避免对系统造成负担

---

## 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0 | 2024-01 | 初始版本，基础统计查询功能 |
| v1.1 | 2024-11 | 新增周限制详细字段：`weeklyCost`、`weeklyStartTime`、`weeklyResetTime`、`isWeeklyCostActive`、`weeklyRemaining`、`weeklyUsagePercentage` |

---

## 相关接口

- `/apiStats/api/get-key-id` - 通过 API Key 获取 API ID
- `/apiStats/api/user-model-stats` - 用户模型统计查询
- `/apiStats/api/batch-stats` - 批量统计查询（需管理员权限）
- `/v1/key-info` - 简化版的 API Key 信息查询（需在请求头中携带 API Key）

---

## 技术支持

如有问题或建议，请提交 Issue 到项目 GitHub 仓库。
