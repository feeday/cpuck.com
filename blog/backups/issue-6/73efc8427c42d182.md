# win11-key

# Windows 11 是否“正版”？普通人判断指南

> 目的：用 **Windows 自带命令**判断当前系统是什么版本、是否已激活、使用的是 Retail / OEM / MAK / KMS 哪种授权通道，并理解“已激活”和“授权来源合规”不是一回事。  
> 不需要安装任何第三方软件。

---

## 一句话先讲明白

判断 Windows 是否“正版”，最好分成两件事：

1. **系统是否已被微软激活**  
   看 `LicenseStatus`、`slmgr /xpr` 等结果。
2. **你是否拥有合规的许可证使用权**  
   要结合授权通道和购买/获得来源判断。

所以：

> **“已激活” ≠ 一定拥有正规个人零售许可证。**

例如：
- Retail Key 可以是正规零售授权，也可能来自灰色市场。
- MAK 可以是企业合法批量授权，也可能被拆出来违规零售。
- KMS 在公司/学校内部可以完全合法，但网上所谓“KMS 激活工具”通常不属于正规授权。
- OEM:DM 通常是电脑厂商写入 BIOS/UEFI 的原厂许可证。

---

# 1. 最常用的 3 个查询命令

建议使用 **管理员身份 CMD / Windows Terminal / PowerShell**。

## 1.1 查看最完整的当前授权信息

```cmd
slmgr /dlv
```

重点看：

```text
描述 / Description
许可证状态 / License Status
产品密钥通道 / Product Key Channel
部分产品密钥 / Partial Product Key
```

常见结果：

```text
RETAIL channel
OEM_DM channel
VOLUME_MAK channel
VOLUME_KMSCLIENT channel
```

---

## 1.2 查看当前激活是否有到期时间

```cmd
slmgr /xpr
```

可能看到：

```text
此计算机已永久激活
```

表示当前激活状态没有固定到期日期。

如果是 KMS，通常会显示激活到期时间。

> 注意：  
> “永久激活”只说明当前激活没有固定到期时间，**不等于 Key 永远不会失效，也不等于授权来源一定合规**。

---

## 1.3 查看简略授权信息

```cmd
slmgr /dli
```

适合快速看：

- Windows 版本
- 授权通道
- 部分产品密钥
- 当前许可证状态

---

# 2. 用 PowerShell 查看当前真正使用的授权通道

运行：

```powershell
Get-CimInstance SoftwareLicensingProduct |
Where-Object {$_.PartialProductKey} |
Select-Object Name, Description, LicenseStatus, PartialProductKey
```

典型结果：

```text
Name                             Description
----                             -----------
Windows(R), Professional edition Windows(R) Operating System, VOLUME_MAK channel

LicenseStatus : 1
PartialProductKey : G6PKM
```

## LicenseStatus 怎么看？

最常见：

```text
LicenseStatus = 1
```

表示：

> 当前 Windows 处于已授权 / 已激活状态。

但它仍然**不能单独证明你拥有合法购买凭证或对应组织的批量授权使用资格**。

---

# 3. 查看电脑 BIOS / UEFI 是否自带 OEM Windows Key

现在很多 Windows 11 新版本已经没有 `wmic` 命令，因此推荐 PowerShell。

执行：

```powershell
(Get-CimInstance -ClassName SoftwareLicensingService).OA3xOriginalProductKey
```

如果返回：

```text
XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
```

说明：

> BIOS / UEFI 内置了一枚 OEM 产品密钥。

如果没有任何输出：

> 没有读取到 OA3 固件 OEM Key。

---

# 4. 查看 BIOS 里的 OEM Key 到底是什么版本

执行：

```powershell
Get-CimInstance SoftwareLicensingService |
Select-Object OA3xOriginalProductKey, OA3xOriginalProductKeyDescription
```

可能看到：

```text
[4.0] CoreCountrySpecific OEM:DM
```

或者：

```text
Professional OEM:DM
```

常见含义：

| 显示 | 含义 |
|---|---|
| `Core` | Windows Home 家庭版 |
| `CoreCountrySpecific` | 特定国家/地区的家庭版，常见于中国市场 OEM 电脑 |
| `Professional` | Windows Pro 专业版 |
| `OEM:DM` | 厂商写入 BIOS/UEFI 的 OEM Digital Marker 密钥 |

---

# 5. Retail / OEM / MAK / KMS 怎么区分？

## 5.1 RETAIL channel

显示：

```text
RETAIL channel
```

通常代表：

> 零售授权通道。

特点：

- 常见于微软官方、正规授权经销商购买的 Retail Key。
- 一般比 OEM 更容易迁移到新设备。
- 通常不是企业批量授权。

但是：

> **显示 Retail 只证明这个 Key 属于 Retail 通道，不证明你的购买来源一定正规。**

例如某些灰色市场可能出售真实 Retail Key，但来源不透明、重复销售或违反区域/许可规则。

---

## 5.2 OEM_DM / OEM:DM

显示类似：

```text
OEM_DM channel
```

或者 BIOS 描述：

```text
OEM:DM
```

通常代表：

> 电脑厂商随设备预装的 OEM 授权，密钥写在 BIOS / UEFI 中。

特点：

- 常见于联想、惠普、戴尔、小米等品牌电脑。
- 通常与这台设备绑定。
- 重装对应 Windows 版本时，经常可以自动读取 Key 并联网激活。
- 一般不适合作为 Retail 授权迁移到另一台电脑。

对于品牌电脑来说：

> **OEM:DM 通常是来源最清晰的一种授权。**

---

## 5.3 VOLUME_MAK

显示：

```text
VOLUME_MAK channel
```

MAK = Multiple Activation Key，多次激活密钥。

主要用于：

> 企业、机构、学校等批量授权环境。

特点：

- 可以直接连接微软激活服务器完成激活。
- 通常不像 KMS 那样每隔一段时间必须续期。
- `slmgr /xpr` 可能显示“永久激活”。
- 一个 MAK 可以根据微软授予的激活次数激活多台设备。

### MAK 是不是盗版？

**不能仅凭 MAK 判断。**

如果：

> 公司购买了微软批量授权，并把 MAK 合法分配给员工设备

那么完全可以是正规授权。

但如果：

> 一个本来属于企业的 MAK 被第三方拆出来，几元、几十元卖给普通个人

那么即使能够通过微软服务器激活，也不能证明购买者拥有对应的批量授权使用权。

所以：

> **MAK 可以是真 Key、真激活，但来源可能是灰色市场。**

---

## 5.4 VOLUME_KMSCLIENT

显示：

```text
VOLUME_KMSCLIENT channel
```

代表：

> Windows 当前是 KMS 客户端授权模式。

KMS 本身是微软为企业提供的正规批量激活机制。

正规使用场景：

```text
公司电脑
学校电脑
机构内部设备
```

这些设备定期连接组织内部的 KMS Server 续期。

但网上很多所谓：

```text
KMS 激活工具
```

会模拟或连接非授权 KMS 服务。

因此：

> **KMS 技术本身不是盗版；是否合规取决于你是否属于对应批量授权组织。**

---

# 6. “数字许可证”又是什么？

Windows 设置里经常显示：

```text
Windows 已使用数字许可证激活
```

或者：

```text
Windows 已使用与你的 Microsoft 帐户关联的数字许可证激活
```

这描述的是：

> 当前设备的激活状态已经被微软服务器记录。

它**不是授权渠道名称**。

也就是说，数字许可证背后仍然可能来自：

- Retail
- OEM
- 合法升级
- 其他授权路径

所以不要仅凭：

```text
已使用数字许可证激活
```

就判断一定是正规 Retail。

---

# 7. “永久激活”到底是什么意思？

运行：

```cmd
slmgr /xpr
```

如果显示：

```text
此计算机已永久激活
```

它主要表示：

> 当前许可证状态不存在类似 KMS 那样的固定到期日期。

它不等于：

```text
这个 Key 永远不会被微软封
```

也不等于：

```text
以后换主板还能继续用
```

更不等于：

```text
你一定拥有合法的 Retail 购买授权
```

---

# 8. 最容易误解的几个说法

## “能激活就是正版”

不严谨。

更准确：

> 能激活 = 微软激活系统当前接受了该许可证状态。

但是否合法使用，还要看：

- Key 来源
- 授权协议
- 是否属于对应组织
- 是否是 OEM 绑定设备
- 是否是正规 Retail 购买

---

## “MAK 就是破解”

不对。

MAK 本身是微软官方批量授权机制。

问题只在：

> **你是否有资格使用这枚 MAK。**

---

## “KMS 就一定盗版”

也不对。

企业内部正规 KMS 完全合法。

网上第三方 KMS 激活工具则是另一回事。

---

## “Retail 就一定百分百正规”

也不能这么判断。

`RETAIL channel` 只代表密钥类型。

如果购买来源不透明，例如极低价灰色 Key 市场，仍然可能存在：

- 跨区销售
- 重复销售
- 违反许可协议
- 来源无法证明

---

# 9. 普通人最实用的判断表

| 查询结果 | 当前能否激活 | 常见来源 | 普通人如何理解 |
|---|---:|---|---|
| `RETAIL channel` | ✅ | 零售 Key | 最接近个人购买，但仍要看来源 |
| `OEM_DM channel` | ✅ | 品牌机原厂 | 通常来源很清晰，绑定设备 |
| `VOLUME_MAK channel` | ✅ | 企业批量授权 | 真 Key 不代表个人有合法使用权 |
| `VOLUME_KMSCLIENT` | ✅ | 企业 KMS | 公司/学校内正常，个人第三方 KMS 要警惕 |
| `LicenseStatus = 1` | ✅ | 任意合法激活路径 | 只表示当前已授权状态 |
| `/xpr` 永久激活 | ✅ | Retail/OEM/MAK 等 | 不代表许可证来源一定合法 |

---

# 10. 推荐的一套完整检查流程

## 第一步：看当前是什么 Windows

```cmd
winver
```

查看：

- Windows 10 / 11
- Home / Pro 等版本
- 系统版本号

---

## 第二步：看当前授权通道

```cmd
slmgr /dlv
```

重点找：

```text
RETAIL
OEM
VOLUME_MAK
VOLUME_KMSCLIENT
```

---

## 第三步：看是否永久激活

```cmd
slmgr /xpr
```

---

## 第四步：用 PowerShell 再确认当前许可证

```powershell
Get-CimInstance SoftwareLicensingProduct |
Where-Object {$_.PartialProductKey} |
Select-Object Name, Description, LicenseStatus, PartialProductKey
```

---

## 第五步：检查 BIOS 是否自带 OEM Key

```powershell
Get-CimInstance SoftwareLicensingService |
Select-Object OA3xOriginalProductKey, OA3xOriginalProductKeyDescription
```

---

# 11. 一个实际案例

某电脑查询得到：

```text
Windows(R), Professional edition
Windows(R) Operating System, VOLUME_MAK channel
LicenseStatus = 1
```

并且：

```cmd
slmgr /xpr
```

显示：

```text
此计算机已永久激活
```

说明：

> 当前安装的是 Windows 11 Pro，并通过 MAK 批量许可证成功激活，目前没有固定到期日期。

同时 BIOS 查询：

```text
[4.0] CoreCountrySpecific OEM:DM
```

说明：

> 这台电脑原厂真正随机器附带的是 Windows Home 系列 OEM 授权，而不是 Pro。

因此实际状态是：

```text
电脑原厂许可证：Windows Home OEM
当前安装系统：Windows 11 Pro
当前 Pro 激活：Volume MAK
当前状态：已激活
```

最准确的说法：

> **当前 Windows 11 Pro 是微软激活体系认可的已激活系统，但 Pro 授权来自 Volume MAK；如果无法证明自己属于对应批量授权组织，那么这份 Pro 授权的来源属于不明确或灰色市场。电脑自身明确拥有的原厂许可证则是 Windows Home OEM。**

---

# 12. 如果商家号称卖的是“Win11 Pro Retail”

购买并激活以后运行：

```cmd
slmgr /dlv
```

如果真正是 Retail 通道，通常应该看到：

```text
RETAIL channel
```

如果却看到：

```text
VOLUME_MAK channel
```

那么：

> **商品如果明确宣称“Retail”，实际却是 MAK，可以认为实际授权通道与商品描述不一致。**

如果看到：

```text
VOLUME_KMSCLIENT channel
```

那就更不是个人 Retail Key。

---

# 13. 安全提醒：不要公开完整产品密钥

执行：

```powershell
(Get-CimInstance -ClassName SoftwareLicensingService).OA3xOriginalProductKey
```

可能直接输出完整的 25 位 Key。

不要在论坛、群聊、截图里完整公开。

建议遮成：

```text
MHB9N-*****-*****-*****-RRHCK
```

当前授权查询通常只需要看：

```text
PartialProductKey
```

也就是最后 5 位即可。

---

# 14. 最后给普通人的判断口诀

```text
先看版本，再看通道；
激活是真的，不代表来源一定正规。

OEM 看主板；
Retail 看购买渠道；
MAK 看有没有企业授权资格；
KMS 看是不是正规组织内部服务器。

“已激活”解决的是技术状态，
“是不是正版授权”还要看许可证来源和使用权。
```

