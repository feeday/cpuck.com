# 3G-USB

# Windows 11 修复华为 WCDMA USB 上网卡驱动记录

## 设备信息

设备：

```
HUAWEI Mobile Connect - USB Device
```

硬件 ID：

```
USB\VID_12D1&PID_1446
```

驱动：

```
ewusbdev.sys
```

驱动版本：

```
1.0.0.7
```

驱动日期：

```
2009/07/23
```

设备类型：

```
HUAWEI WCDMA 3G USB Modem
```

---

# 一、初始问题

Windows 11 插入设备后提示：

```
无法在此设备上加载驱动程序

驱动程序:
ewusbdev.sys

安全设置将阻止加载此驱动程序
```

设备管理器：

```
HUAWEI Mobile Connect - USB Device (COM5)
```

状态：

```
代码 39

Windows 无法加载这个硬件的设备驱动程序。
驱动程序可能已损坏或不存在。
```

---

# 二、确认驱动来源

执行：

```cmd
pnputil /enum-drivers | findstr /i /c:"Huawei" /c:"ewusb"
```

发现：

```
原始名称: ewusbdev.inf
提供程序名称: HUAWEI Incorporated
驱动程序版本: 07/23/2009 1.0.0.7
属性: Legacy
```

完整驱动组件：

```
ewusbdev.inf
ewser2k.inf
ewmdm2k.inf
ewnet.inf
ewdcsc.inf
```

功能：

| 文件 | 功能 |
|---|---|
| ewusbdev.inf | USB/COM驱动 |
| ewser2k.inf | 串口驱动 |
| ewmdm2k.inf | Modem驱动 |
| ewnet.inf | 网络驱动 |
| ewdcsc.inf | SIM卡相关 |

---

# 三、排查 Windows 安全阻止

## 1. 检查内存完整性

执行：

```cmd
reg query HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity
```

结果：

```
Enabled REG_DWORD 0x0
```

说明：

```
内存完整性已经关闭
```

---

## 2. 检查驱动阻止列表

执行：

```cmd
reg query HKLM\SYSTEM\CurrentControlSet\Control\CI\Config /v VulnerableDriverBlocklistEnable
```

结果：

```
VulnerableDriverBlocklistEnable REG_DWORD 0x1
```

说明：

Windows 11 仍通过易受攻击驱动阻止列表拦截老驱动。

---

# 四、关闭驱动阻止列表

管理员 CMD：

```cmd
reg add HKLM\SYSTEM\CurrentControlSet\Control\CI\Config /v VulnerableDriverBlocklistEnable /t REG_DWORD /d 0 /f
```

结果：

```
操作成功完成
```

重启电脑。

---

# 五、驱动恢复成功

重启后设备管理器出现：

```
HUAWEI Mobile Connect - 3G Application Interface (COM7)

HUAWEI Mobile Connect - 3G PC UI Interface (COM8)
```

说明：

```
USB驱动正常
串口驱动正常
华为模块正常启动
```

---

# 六、进入华为模块调试

工具：

```
MobaXterm
```

连接：

```
Serial

COM8

115200
```

启动信息：

```
^SIMST:255

^BOOT:40995901,0,0,0,20

^SRVST:4
```

说明：

```
华为基带芯片已经启动
```

---

# 七、SIM卡问题排查

联通客户端提示：

```
无SIM卡或SIM卡错误
```

更换SIM卡测试：

```
仍无法识别
```

判断：

不是 Windows 驱动问题。

可能原因：

1. SIM卡兼容问题
2. SIM卡槽接触问题
3. 模块SIM读卡部分故障
4. 3G网络退网导致业务不可用

---

# 八、是否可以升级4G？

结论：

```
不能
```

原因：

该设备硬件属于：

```
WCDMA/HSPA 3G Modem
```

硬件结构：

```
USB接口
 ↓
3G基带芯片
 ↓
WCDMA射频
 ↓
天线
```

4G LTE需要：

```
LTE基带芯片
 ↓
LTE射频
 ↓
LTE频段支持
```

驱动只能控制已有硬件。

不能增加：

- LTE基带
- LTE射频
- 4G频段支持

因此：

```
修改驱动 ≠ 支持4G

刷固件 ≠ 变4G
```

---

# 九、最终结果

## 已解决

✅ Windows 11 驱动加载问题

✅ ewusbdev.sys 被阻止问题

✅ COM通信恢复

✅ 华为模块启动正常


## 未解决

SIM无法识别。


## 最终判断

设备：

```
2009年前后的华为WCDMA 3G USB上网卡
```

不是4G设备。

---

# 十、4G替代设备建议

如果需要4G LTE：

推荐：

```
Huawei E3372

Huawei E8372

ZTE MF79U
```

这些属于真正 LTE 硬件。

---

# 总结

本次测试证明：

```
Windows 11
+
2009 Huawei WCDMA USB Modem
+
Legacy驱动

仍然可以恢复运行
```

但是：

```
3G硬件无法通过驱动升级成为4G
```
