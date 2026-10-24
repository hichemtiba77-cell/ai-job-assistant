from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "diagrams"
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 1600, 900
FONT_PATH = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT = FontProperties(fname=str(FONT_PATH)) if FONT_PATH.exists() else FontProperties()
FONT_BOLD = (
    FontProperties(fname=str(FONT_PATH), weight="bold")
    if FONT_PATH.exists()
    else FontProperties(weight="bold")
)

BG = "#F7F9FC"
INK = "#172B4D"
MUTED = "#5B6475"
LINE = "#B8C4D6"
BLUE = "#2563EB"
BLUE_LIGHT = "#E8F0FE"
CYAN = "#0891B2"
CYAN_LIGHT = "#E6F7FA"
GREEN = "#0F9F77"
GREEN_LIGHT = "#E8F7F1"
ORANGE = "#D97706"
ORANGE_LIGHT = "#FFF4E5"
RED = "#C2410C"
RED_LIGHT = "#FFF0EB"
WHITE = "#FFFFFF"


def canvas(title: str, subtitle: str, footer: str) -> tuple[plt.Figure, plt.Axes]:
    fig, ax = plt.subplots(figsize=(16, 9), dpi=140)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, W)
    ax.set_ylim(0, H)
    ax.axis("off")
    ax.text(
        80,
        H - 75,
        title,
        fontproperties=FONT_BOLD,
        fontsize=31,
        color=INK,
        va="center",
    )
    ax.text(
        80,
        H - 122,
        subtitle,
        fontproperties=FONT,
        fontsize=17,
        color=MUTED,
        va="center",
    )
    ax.plot([80, W - 80], [H - 155, H - 155], color="#DCE4EF", lw=1.5)
    ax.text(
        80,
        34,
        footer,
        fontproperties=FONT,
        fontsize=11,
        color="#7A8494",
        va="center",
    )
    return fig, ax


def box(
    ax: plt.Axes,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    face: str = WHITE,
    edge: str = LINE,
    lw: float = 1.6,
    radius: float = 22,
    dashed: bool = False,
) -> FancyBboxPatch:
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        facecolor=face,
        edgecolor=edge,
        linewidth=lw,
        linestyle="--" if dashed else "-",
    )
    ax.add_patch(patch)
    return patch


def text(
    ax: plt.Axes,
    x: float,
    y: float,
    value: str,
    *,
    size: float = 16,
    color: str = INK,
    bold: bool = False,
    ha: str = "center",
    va: str = "center",
    linespacing: float = 1.35,
) -> None:
    ax.text(
        x,
        y,
        value,
        fontproperties=FONT_BOLD if bold else FONT,
        fontsize=size,
        color=color,
        ha=ha,
        va=va,
        linespacing=linespacing,
    )


def arrow(
    ax: plt.Axes,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    *,
    color: str = BLUE,
    lw: float = 3,
    style: str = "-|>",
    connection: str = "arc3",
    rad: float = 0,
) -> None:
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle=style,
            mutation_scale=20,
            color=color,
            linewidth=lw,
            connectionstyle=f"{connection},rad={rad}",
            shrinkA=0,
            shrinkB=0,
        )
    )


def pill(
    ax: plt.Axes,
    x: float,
    y: float,
    w: float,
    label: str,
    *,
    face: str,
    color: str,
) -> None:
    box(ax, x, y, w, 34, face=face, edge=face, radius=17)
    text(ax, x + w / 2, y + 17, label, size=12, color=color, bold=True)


def numbered_step(
    ax: plt.Axes,
    x: float,
    y: float,
    w: float,
    h: float,
    number: int,
    title: str,
    body: str,
    *,
    accent: str = BLUE,
    face: str = WHITE,
) -> None:
    box(ax, x, y, w, h, face=face)
    ax.add_patch(
        plt.Circle(
            (x + 35, y + h - 34),
            radius=19,
            facecolor=accent,
            edgecolor="none",
        )
    )
    text(ax, x + 35, y + h - 34, str(number), size=13, color=WHITE, bold=True)
    text(ax, x + 65, y + h - 34, title, size=18, color=INK, bold=True, ha="left")
    text(
        ax,
        x + 25,
        y + h - 88,
        body,
        size=14,
        color=MUTED,
        ha="left",
        va="top",
        linespacing=1.5,
    )


def save(fig: plt.Figure, stem: str) -> None:
    fig.savefig(OUT_DIR / f"{stem}.png", dpi=180, bbox_inches="tight", facecolor=BG)
    fig.savefig(OUT_DIR / f"{stem}.svg", bbox_inches="tight", facecolor=BG)
    plt.close(fig)


def user_flow() -> None:
    fig, ax = canvas(
        "用户实现流程",
        "从第一次注册到完成模拟面试，产品只要求用户走完四个阶段。",
        "AI求职助手 · 用户旅程 · 2026.10",
    )

    xs = [60, 440, 820, 1200]
    card_w = 340
    titles = ["01  进入个人空间", "02  提交求职材料", "03  获得诊断结果", "04  训练与持续使用"]
    colors = [BLUE, CYAN, GREEN, ORANGE]
    faces = [BLUE_LIGHT, CYAN_LIGHT, GREEN_LIGHT, ORANGE_LIGHT]
    steps = [
        ["邮箱注册 / 登录", "确认个人信息", "进入我的简历库"],
        ["粘贴简历文字", "上传普通文字PDF", "添加1—多个岗位"],
        ["AI解析与证据匹配", "查看岗位适配排行", "阅读差距和修改建议"],
        ["选择目标岗位", "完成文字模拟面试", "查看、保存或删除记录"],
    ]

    for i, x in enumerate(xs):
        box(ax, x, 185, card_w, 520, face=WHITE)
        box(ax, x, 646, card_w, 59, face=faces[i], edge=faces[i], radius=20)
        text(ax, x + card_w / 2, 675, titles[i], size=18, color=colors[i], bold=True)
        for j, step in enumerate(steps[i]):
            yy = 548 - j * 155
            box(ax, x + 28, yy, 284, 96, face=BG, edge="#DCE4EF", radius=18)
            ax.add_patch(
                plt.Circle((x + 62, yy + 48), radius=17, facecolor=colors[i], edgecolor="none")
            )
            text(ax, x + 62, yy + 48, str(j + 1), size=12, color=WHITE, bold=True)
            text(ax, x + 93, yy + 48, step, size=15, color=INK, ha="left")

    for i in range(3):
        arrow(
            ax,
            xs[i] + card_w + 3,
            445,
            xs[i + 1] - 5,
            445,
            color=colors[i],
            lw=4,
        )

    box(ax, 115, 96, 1370, 58, face="#EEF3FA", edge="#DDE6F2", radius=20)
    text(
        ax,
        800,
        125,
        "现场演示可直接加载示例简历和岗位；真实上传入口仍然保留，保证流程既可演示也能实际使用。",
        size=14,
        color=MUTED,
    )
    save(fig, "01-用户实现流程")


def ai_pipeline() -> None:
    fig, ax = canvas(
        "AI分析链路",
        "程序负责可重复的评分和排序，DeepSeek负责证据解释与建议，避免总分完全靠模型感觉。",
        "AI求职助手 · 分析与评分 · 2026.10",
    )

    numbered_step(
        ax,
        70,
        570,
        335,
        165,
        1,
        "读取材料",
        "简历文字、多个岗位JD\n保留原文件与解析结果",
        accent="#64748B",
        face="#F1F5F9",
    )
    numbered_step(
        ax,
        455,
        570,
        335,
        165,
        2,
        "结构化提取",
        "技能、经历、项目、教育\n岗位必须条件与优先条件",
        accent=BLUE,
        face=BLUE_LIGHT,
    )
    numbered_step(
        ax,
        840,
        570,
        335,
        165,
        3,
        "证据匹配",
        "逐条岗位要求找简历证据\n保留原文片段，区分“缺失”",
        accent=BLUE,
        face=BLUE_LIGHT,
    )
    numbered_step(
        ax,
        1225,
        570,
        305,
        165,
        4,
        "规则评分",
        "分项权重 + 硬性条件\n计算总分并生成岗位排序",
        accent=GREEN,
        face=GREEN_LIGHT,
    )

    arrow(ax, 407, 652, 451, 652, color=BLUE)
    arrow(ax, 792, 652, 836, 652, color=BLUE)
    arrow(ax, 1177, 652, 1221, 652, color=GREEN)
    arrow(ax, 1377, 562, 1377, 500, color=GREEN)

    numbered_step(
        ax,
        1075,
        330,
        455,
        166,
        5,
        "DeepSeek解释与建议",
        "引用简历证据，说明优势与差距\n输出具体、可执行的修改建议",
        accent=ORANGE,
        face=ORANGE_LIGHT,
    )
    arrow(ax, 1072, 412, 1028, 412, color=ORANGE)

    numbered_step(
        ax,
        620,
        330,
        395,
        166,
        6,
        "结果组装",
        "总分、分项分、置信度\n证据、缺口、建议、原始JD",
        accent=CYAN,
        face=CYAN_LIGHT,
    )
    arrow(ax, 616, 412, 572, 412, color=CYAN)

    numbered_step(
        ax,
        180,
        330,
        380,
        166,
        7,
        "用户结果页",
        "岗位排行 → 单岗位详情\n → 针对该岗位的模拟面试",
        accent=GREEN,
        face=GREEN_LIGHT,
    )
    arrow(ax, 176, 412, 132, 412, color=GREEN)

    box(ax, 105, 168, 1370, 104, face=WHITE)
    legend_items = [
        (135, 382, BLUE, "程序规则\n结果可重复"),
        (555, 382, ORANGE, "AI生成\n格式必须校验"),
        (975, 470, CYAN, "结果整合\n统一进入页面"),
    ]
    for lx, lw, color, label in legend_items:
        box(ax, lx, 191, lw, 58, face=BG, edge="#DDE6F2", radius=16)
        ax.plot([lx + 20, lx + 20], [199, 241], color=color, lw=7, solid_capstyle="round")
        text(ax, lx + 42, 220, label, size=13.5, color=INK, ha="left", linespacing=1.35)

    text(
        ax,
        800,
        122,
        "关键原则：简历没写到 ≠ 候选人一定不具备。缺少证据时标记“未找到”，并降低判断置信度。",
        size=15,
        color=RED,
        bold=True,
    )
    save(fig, "02-AI分析链路")


def architecture() -> None:
    fig, ax = canvas(
        "技术结构",
        "网站页面与后台放在一个Next.js项目中；密钥只在服务器端使用。",
        "AI求职助手 · 推荐技术架构 · 2026.10",
    )

    box(ax, 70, 220, 350, 520, face=WHITE)
    pill(ax, 105, 685, 280, "用户浏览器", face=BLUE_LIGHT, color=BLUE)
    browser_items = ["注册 / 登录", "简历与岗位输入", "岗位适配排行", "诊断详情", "模拟面试", "历史记录"]
    for i, item in enumerate(browser_items):
        yy = 600 - i * 64
        box(ax, 105, yy, 280, 46, face=BG, edge="#DCE4EF", radius=14)
        text(ax, 245, yy + 23, item, size=14, color=INK)
    text(ax, 245, 250, "浏览器中不出现\nDeepSeek密钥", size=13, color=RED, bold=True)

    box(ax, 535, 170, 520, 570, face=WHITE, edge=BLUE, lw=2)
    pill(ax, 585, 685, 420, "Next.js：页面 + 服务端接口", face=BLUE_LIGHT, color=BLUE)
    server_items = [
        ("页面与交互", "把排版、按钮和结果组织给用户"),
        ("PDF文字提取", "文字优先，OCR作为后续增强"),
        ("提示词与格式校验", "要求结构化结果，失败时重试或提示"),
        ("业务规则", "权重评分、硬性条件、排序、权限检查"),
        ("错误与成本控制", "限次、缓存、超时提示、备用演示数据"),
    ]
    for i, (head, body) in enumerate(server_items):
        yy = 596 - i * 91
        box(ax, 575, yy, 440, 70, face="#F8FAFD", edge="#DCE4EF", radius=16)
        text(ax, 600, yy + 44, head, size=14, color=INK, bold=True, ha="left")
        text(ax, 600, yy + 20, body, size=12, color=MUTED, ha="left")

    arrow(ax, 425, 475, 530, 475, color=BLUE, lw=4)
    text(ax, 478, 500, "HTTPS", size=11, color=MUTED)

    box(ax, 1175, 515, 350, 220, face=ORANGE_LIGHT, edge=ORANGE)
    pill(ax, 1205, 680, 290, "DeepSeek API", face=ORANGE_LIGHT, color=ORANGE)
    text(ax, 1350, 612, "岗位解释与修改建议\n模拟面试出题与点评", size=15, color=INK)
    text(ax, 1350, 555, "只由服务器调用", size=13, color=RED, bold=True)
    arrow(ax, 1060, 625, 1170, 625, color=ORANGE, lw=4)

    box(ax, 1175, 235, 350, 225, face=GREEN_LIGHT, edge=GREEN)
    pill(ax, 1205, 405, 290, "Supabase", face=GREEN_LIGHT, color=GREEN)
    text(
        ax,
        1350,
        330,
        "邮箱账号\n用户数据库\n私有简历文件\n隔离的用户记录",
        size=15,
        color=INK,
        linespacing=1.45,
    )
    arrow(ax, 1060, 350, 1170, 350, color=GREEN, lw=4)

    box(ax, 70, 82, 1455, 74, face="#EEF3FA", edge="#DDE6F2", radius=20)
    text(
        ax,
        798,
        119,
        "安全底线：密钥只放环境变量  ·  每个用户只能看自己的数据  ·  简历文件不公开  ·  用户可删除记录",
        size=14,
        color=INK,
        bold=True,
    )
    save(fig, "03-技术结构")


def roadmap() -> None:
    fig, ax = canvas(
        "开发路线图",
        "先完成可演示闭环，再增加容易拖延的OCR与视觉增强。",
        "AI求职助手 · 10月21日至11月4日 · 基准计划",
    )

    stages = [
        ("01", "10/21—23", "定范围", "分工、测试材料\n页面草图\n申报初稿", BLUE, BLUE_LIGHT),
        ("02", "10/24—26", "搭骨架", "可点击页面\n示例数据\n完整流程", CYAN, CYAN_LIGHT),
        ("03", "10/27—31", "跑核心", "DeepSeek文字分析\n排行与建议\nPDF文字提取", GREEN, GREEN_LIGHT),
        ("04", "11/1—03", "能演示", "账号与记录\n模拟面试、部署\n测试、申报表", ORANGE, ORANGE_LIGHT),
        ("05", "11/4起", "再完善", "提交申报\n用户试用与修复\n决赛准备", "#64748B", "#F1F5F9"),
    ]
    xs = [70, 370, 670, 970, 1270]
    for i, (num, date, head, body, accent, face) in enumerate(stages):
        x = xs[i]
        box(ax, x, 280, 260, 360, face=face, edge=accent, lw=2)
        ax.add_patch(plt.Circle((x + 52, 587), radius=28, facecolor=accent, edgecolor="none"))
        text(ax, x + 52, 587, num, size=16, color=WHITE, bold=True)
        text(ax, x + 92, 587, date, size=17, color=accent, bold=True, ha="left")
        text(ax, x + 130, 510, head, size=24, color=INK, bold=True)
        text(ax, x + 130, 405, body, size=14, color=MUTED, linespacing=1.6)
        if i < len(stages) - 1:
            arrow(ax, x + 264, 460, xs[i + 1] - 6, 460, color=accent, lw=4)

    box(ax, 70, 180, 650, 60, face=WHITE, edge="#DDE6F2", radius=18)
    text(ax, 395, 210, "最早部署时点：页面骨架完成后立即试部署", size=15, color=BLUE, bold=True)
    box(ax, 755, 180, 770, 60, face=RED_LIGHT, edge="#F5C7B8", radius=18)
    text(ax, 1140, 210, "进度落后时：先砍OCR和视觉特效，不砍账号、排行与模拟面试", size=14, color=RED, bold=True)

    text(ax, 800, 116, "每个阶段都以“能实际操作并验收”为完成，不以“代码写完”为完成。", size=15, color=MUTED)
    save(fig, "04-开发路线图")


def roles() -> None:
    fig, ax = canvas(
        "队内分工",
        "四个人围绕同一个产品闭环协作；AI助手承担主要代码与部署工作。",
        "AI求职助手 · 建议4人配置 · 3人队伍可合并产品体验职责",
    )

    ax.add_patch(plt.Circle((800, 475), radius=92, facecolor=BLUE, edgecolor="none"))
    text(ax, 800, 502, "AI求职助手", size=22, color=WHITE, bold=True)
    text(ax, 800, 452, "共同交付\n真实可演示应用", size=13, color="#EAF2FF")

    cards = [
        (
            80,
            535,
            "项目负责人",
            ["定方向与优先级", "推进时间表", "申报 / PPT / 现场讲解", "平台账号与密钥管理"],
            BLUE,
            BLUE_LIGHT,
        ),
        (
            920,
            535,
            "AI与质量负责人",
            ["准备测试案例", "检查评分与证据", "维护提示词变更记录", "发现编造与空泛评价"],
            ORANGE,
            ORANGE_LIGHT,
        ),
        (
            80,
            255,
            "数据与场景负责人",
            ["收集岗位并记录来源", "制作虚构简历", "取得授权并脱敏", "整理用户试用反馈"],
            GREEN,
            GREEN_LIGHT,
        ),
        (
            920,
            255,
            "产品体验与运营",
            ["按普通学生视角试用", "检查文案和操作流程", "准备截图 / 录屏", "访问与现场网络测试"],
            CYAN,
            CYAN_LIGHT,
        ),
    ]

    for x, y, title, items, accent, face in cards:
        box(ax, x, y, 600, 170, face=WHITE, edge=accent, lw=2)
        pill(ax, x + 24, y + 121, 250, title, face=face, color=accent)
        for i, item in enumerate(items):
            tx = x + (35 if i < 2 else 310)
            ty = y + (82 if i % 2 == 0 else 38)
            ax.add_patch(plt.Circle((tx, ty), radius=5, facecolor=accent, edgecolor="none"))
            text(ax, tx + 18, ty, item, size=13, color=INK, ha="left")

    arrow(ax, 724, 508, 684, 575, color=BLUE, lw=3, connection="arc3", rad=0.08)
    arrow(ax, 876, 508, 916, 575, color=ORANGE, lw=3, connection="arc3", rad=-0.08)
    arrow(ax, 724, 442, 684, 340, color=GREEN, lw=3, connection="arc3", rad=-0.08)
    arrow(ax, 876, 442, 916, 340, color=CYAN, lw=3, connection="arc3", rad=0.08)

    box(ax, 100, 88, 1400, 92, face="#F1F5F9", edge=LINE, dashed=True, radius=20)
    text(ax, 800, 151, "AI助手：项目骨架 · 页面 · 数据库 · DeepSeek接口 · PDF · 提示词 · 测试 · 部署协助", size=16, color=INK, bold=True)
    text(ax, 800, 112, "全员共同责任：每日同步 · 用真实操作验收 · 不用未经授权的数据 · 不在聊天和代码中暴露密钥", size=13, color=MUTED)
    save(fig, "05-队内分工")


def evaluation_map() -> None:
    fig, ax = canvas(
        "比赛评审与项目证据",
        "每一项评审要求都要能在网站、测试记录或申报材料中找到对应证据。",
        "AI求职助手 · 评审对齐 · 来源：比赛附件3",
    )

    head_y = 662
    box(ax, 80, head_y, 290, 66, face=BLUE, edge=BLUE, radius=18)
    text(ax, 225, head_y + 33, "评审关注", size=18, color=WHITE, bold=True)
    box(ax, 450, head_y, 1070, 66, face=GREEN, edge=GREEN, radius=18)
    text(ax, 985, head_y + 33, "本项目要拿出的证据", size=18, color=WHITE, bold=True)

    rows = [
        ("场景与问题价值", "B2真实需求 + 求职痛点 + 目标用户画像 + 学生访谈"),
        ("实际应用效果", "10组人工标注案例 + 排序结果 + 用户试用与任务完成记录"),
        ("智能体方案设计", "简历解析 → 岗位解析 → 证据匹配 → 规则评分 → AI解释 → 面试"),
        ("创新性", "不是普通聊天：分数可解释、建议有证据、面试针对个人短板"),
        ("用户体验", "四阶段流程 + 示例数据 + 清楚错误提示 + 手机端可用"),
        ("安全与规范", "自建/授权脱敏数据 + 私有存储 + 用户隔离 + 环境变量密钥"),
    ]

    for i, (criterion, evidence) in enumerate(rows):
        y = 562 - i * 75
        box(ax, 80, y, 290, 58, face=WHITE, edge="#DDE6F2", radius=16)
        text(ax, 225, y + 29, criterion, size=16, color=INK, bold=True)
        arrow(ax, 375, y + 29, 445, y + 29, color=BLUE, lw=3)
        box(ax, 450, y, 1070, 58, face="#F8FAFD", edge="#DDE6F2", radius=16)
        text(ax, 485, y + 29, evidence, size=14, color=MUTED, ha="left")

    box(ax, 80, 96, 1440, 64, face=ORANGE_LIGHT, edge=ORANGE, radius=18)
    text(
        ax,
        800,
        128,
        "最重要的不是“用了多少技术”，而是能不能让评委看到：问题真实、任务完成、效果可验证、用户愿意用。",
        size=15,
        color=RED,
        bold=True,
    )
    save(fig, "06-评审与证据")


def complete_roadmap() -> None:
    fig, ax = canvas(
        "完整开发路线图：从MVP到决赛版本",
        "先做能跑通的核心，再做真实保存和演示，最后才优化界面、OCR和语音。",
        "AI求职助手 · MVP分阶段计划 · 2026.10",
    )

    columns = [
        (
            "阶段0\n原型",
            "10/21—23",
            ["四个页面流程", "一套示例数据", "P0 / P1 / P2清单"],
            ["先画结构", "不修饰颜色", "全队能看懂路径"],
            ["只设计字段", "规划简历、岗位、结果", "暂不接数据库"],
            ["注册平台", "部署空页面", "确认网络可访问"],
            ["全队看懂流程", "范围和分工确定"],
            "#64748B",
            "#F1F5F9",
        ),
        (
            "阶段1\nMVP核心",
            "10/24—28",
            ["粘贴文字简历", "添加多个岗位", "DeepSeek评分与排行", "证据、差距、建议"],
            ["基础清晰界面", "先保证能用", "结果必须易读"],
            ["暂不接数据库", "使用示例/临时数据", "完成数据表设计"],
            ["部署文字版", "测试DeepSeek", "准备备用示例结果"],
            ["10组测试排序合理", "评价引用简历证据"],
            BLUE,
            BLUE_LIGHT,
        ),
        (
            "阶段2\n可用版本",
            "10/29—31",
            ["普通PDF文字提取", "文字模拟面试", "保存简历与历史", "删除个人记录"],
            ["统一排版", "补齐空状态", "补齐错误提示"],
            ["Supabase邮箱账号", "数据库+私有文件", "用户数据隔离"],
            ["测试邮箱和PDF", "校园网访问测试", "两个账号隔离测试"],
            ["普通PDF可分析", "不同账号互不可见"],
            CYAN,
            CYAN_LIGHT,
        ),
        (
            "阶段3\n参赛版本",
            "11/1—4",
            ["完整流程串联", "一键加载示例", "保存面试记录", "提交申报材料"],
            ["第一次全面美化", "手机端适配", "检查文案与按钮"],
            ["保存面试全过程", "完善数据删除", "补做备份"],
            ["正式部署", "手机热点测试", "准备截图和录屏"],
            ["三分钟完整演示", "申请材料与产品一致"],
            GREEN,
            GREEN_LIGHT,
        ),
        (
            "阶段4\n决赛前优化",
            "11/5—决赛",
            ["OCR扫描版PDF", "语音面试（选做）", "简历版本对比（选做）", "导出报告（选做）"],
            ["根据试用反馈优化", "重点改高频路径", "不盲目增加动画"],
            ["性能与稳定性", "清理测试数据", "检查隐私与删除"],
            ["持续更新", "每周完整回归", "保留稳定演示版本"],
            ["5—10名学生试用", "找出并修复高频问题"],
            ORANGE,
            ORANGE_LIGHT,
        ),
    ]

    label_w = 190
    start_x = 80 + label_w + 20
    col_w = 246
    gap = 20
    header_y = 640
    row_h = 83
    row_gap = 10

    box(ax, 80, header_y, label_w, 86, face=INK, edge=INK, radius=18)
    text(ax, 175, header_y + 43, "开发维度", size=17, color=WHITE, bold=True)

    for i, col in enumerate(columns):
        x = start_x + i * (col_w + gap)
        title, date, *_rest = col
        accent = col[-2]
        face = col[-1]
        box(ax, x, header_y, col_w, 86, face=face, edge=accent, lw=2, radius=18)
        text(
            ax,
            x + col_w / 2,
            header_y + 55,
            title.replace("\n", " "),
            size=14,
            color=accent,
            bold=True,
        )
        text(ax, x + col_w / 2, header_y + 24, date, size=12, color=MUTED)

    row_labels = ["产品功能", "界面UI", "账号/数据库", "部署/验证", "阶段验收"]
    for r, row_label in enumerate(row_labels):
        y = header_y - 18 - row_h - r * (row_h + row_gap)
        box(ax, 80, y, label_w, row_h, face=WHITE, edge="#DDE6F2", radius=15)
        text(ax, 175, y + row_h / 2, row_label, size=15, color=INK, bold=True)

        for i, col in enumerate(columns):
            x = start_x + i * (col_w + gap)
            content = col[2 + r]
            accent = col[-2]
            face = "#FBFCFE"
            box(ax, x, y, col_w, row_h, face=face, edge="#DDE6F2", radius=15)
            text(
                ax,
                x + col_w / 2,
                y + row_h / 2,
                "\n".join(content),
                size=11.2,
                color=INK if r in (0, 2, 4) else MUTED,
                linespacing=1.35,
            )
            ax.plot(
                [x + 12, x + col_w - 12],
                [y + row_h - 3, y + row_h - 3],
                color=accent,
                lw=3,
                solid_capstyle="round",
            )

    box(ax, 80, 88, 1460, 58, face=WHITE, edge="#DDE6F2", radius=18)
    text(
        ax,
        810,
        117,
        "顺序原则：数据结构先设计 → 核心分析先跑通 → 再接账号数据库 → 再全面美化UI → 最后加OCR和语音。",
        size=14,
        color=RED,
        bold=True,
    )
    save(fig, "07-MVP到决赛路线图")


def tab_relationship() -> None:
    fig, ax = canvas(
        "求职档案标签关系",
        "四个标签不是四张重复报告，而是围绕同一份岗位证据切换查看方式。",
        "职引者 · HR评审桌UI结构 · 2026.10",
    )

    box(ax, 80, 640, 1440, 104, face=INK, edge=INK, radius=20)
    text(ax, 120, 712, "固定摘要条", size=14, color="#9FC4F8", bold=True, ha="left")
    summary = [
        ("目标岗位", "AI产品实习生"),
        ("匹配参考", "76 / 100"),
        ("证据可靠度", "中"),
        ("硬性门槛", "部分满足"),
    ]
    for i, (label, value) in enumerate(summary):
        x = 310 + i * 295
        text(ax, x, 716, label, size=11, color="#B8C9DD")
        text(ax, x, 681, value, size=17, color=WHITE, bold=True)
        if i:
            ax.plot([x - 35, x - 35], [664, 720], color="#34536F", lw=1.4)

    cards = [
        (
            80,
            "01  诊断概览",
            "先回答“值不值得投”",
            ["匹配参考与等级", "分项表现", "置信度与材料边界"],
            BLUE,
            BLUE_LIGHT,
        ),
        (
            440,
            "02  证据核对",
            "回答“为什么这样判断”",
            ["岗位原文逐条拆解", "简历证据引用", "相关度 / 强度 / 深度"],
            CYAN,
            CYAN_LIGHT,
        ),
        (
            800,
            "03  差距检查",
            "回答“还差什么”",
            ["硬性门槛", "缺失证据", "面试官可能追问"],
            ORANGE,
            ORANGE_LIGHT,
        ),
        (
            1160,
            "04  修改处方",
            "回答“下一步怎么改”",
            ["按优先级排序", "需要补充的事实", "进入编辑或面试"],
            GREEN,
            GREEN_LIGHT,
        ),
    ]

    for i, (x, title, subtitle, items, accent, face) in enumerate(cards):
        box(ax, x, 330, 315, 235, face=face, edge=accent, lw=2)
        pill(ax, x + 22, 514, 210, title, face=WHITE, color=accent)
        text(ax, x + 157, 472, subtitle, size=14, color=INK, bold=True)
        for j, item in enumerate(items):
            yy = 422 - j * 38
            ax.add_patch(plt.Circle((x + 35, yy), radius=4, facecolor=accent, edgecolor="none"))
            text(ax, x + 52, yy, item, size=11.5, color=MUTED, ha="left")
        if i < 3:
            arrow(ax, x + 318, 448, x + 355, 448, color=accent, lw=3)

    arrow(ax, 1317, 325, 1317, 272, color=GREEN, lw=3)
    arrow(ax, 1317, 272, 237, 272, color=GREEN, lw=3, style="-")
    arrow(ax, 237, 272, 237, 325, color=GREEN, lw=3)
    box(ax, 420, 239, 725, 68, face=WHITE, edge="#DDE6F2", radius=16)
    text(
        ax,
        782,
        273,
        "修改后再核对证据 → 更新诊断 → 调整面试追问",
        size=14,
        color=GREEN,
        bold=True,
    )

    text(ax, 80, 160, "关系原则", size=12, color=INK, bold=True, ha="left")
    text(
        ax,
        180,
        160,
        "顶部摘要始终可见；每次只展开一个标签；相同内容只在一个位置维护；修改后回到证据页重新检查。",
        size=13,
        color=MUTED,
        ha="left",
    )
    save(fig, "08-求职档案标签关系")


def main() -> None:
    user_flow()
    ai_pipeline()
    architecture()
    roadmap()
    roles()
    evaluation_map()
    complete_roadmap()
    tab_relationship()
    print(f"Generated diagrams in: {OUT_DIR}")


if __name__ == "__main__":
    main()
