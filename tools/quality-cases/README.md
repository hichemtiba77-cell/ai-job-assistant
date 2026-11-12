# 证据质量评测材料

这里有 24 组合成案例，覆盖 8 个虚构岗位。开发集与保留集各 12 组，岗位互不重叠。每个岗位含直接证据、部分证据和无证据三个变体，门槛覆盖明确满足、明确不满足和待确认。

`_labels.draft.json` 是待复核的标注草稿。每位复核人独立记录可以支持条款的原句、证据充分程度及门槛状态；分歧解决后，将共同确认的原句和门槛结论写入另存的标签文件。发布验收使用复核后标签，保留集只用于最终检查。

例如在本地服务启动后运行开发集流程：

```powershell
npm run eval:consistency -- --mode fixed --runs 1 --cases tools/quality-cases/development --annotations tools/quality-cases/development/_labels.draft.json
```

用草稿运行只用于检查统计流程。此目录不包含真实求职者资料。
