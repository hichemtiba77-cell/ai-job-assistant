from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "赛事文件"
    / "附件2：郑州大学首届AI智能体创新应用大赛项目申报表.docx"
)
OUTPUT_DIR = ROOT / "output" / "docx"
OUTPUT = OUTPUT_DIR / "附件2：郑州大学首届AI智能体创新应用大赛项目申报表-最终版.docx"

PROJECT_INTRO = (
    "“职引者”面向郑州大学本科生和研究生在实习、校招和研究生就业中的真实需求，"
    "解决岗位信息筛选困难、简历与岗位要求对应不清、修改建议空泛及面试准备缺少针对性等问题。"
    "用户提交简历和目标岗位后，系统从招聘官视角逐条对照岗位要求与简历证据，"
    "展示适配情况、能力缺口和修改建议，并开展针对性模拟面试。"
    "项目结合专业课程、竞赛、科研和实习经历，将校园经历转化为可解释的岗位能力证据，"
    "帮助学生明确投递顺序和下一步行动，并为学校就业指导提供可核验的学生准备摘要。"
    "整体形成“材料导入—证据匹配—简历改进—面试训练—行动跟踪”的求职闭环。"
)

FEATURE_PARAGRAPHS = [
    (
        "项目拟采用Next.js、Supabase和DeepSeek API。普通PDF优先提取文字，"
        "扫描版后续接入OCR；API密钥仅在服务器环境变量中使用。"
    ),
    "一、主要功能",
    (
        "1. 简历与岗位导入：支持文字和普通PDF，后续加入扫描件、图片和岗位截图识别。"
    ),
    (
        "2. 证据化诊断：拆解岗位的硬性条件、核心要求和加分项，逐条关联简历原文，"
        "区分直接证据、表达缺口、证据不足、真实缺口和待确认，输出适配结果与修改建议。"
    ),
    (
        "3. 简历改进与导出：在结构化编辑器中修改经历、调整顺序和照片，"
        "选择原创A4模板并导出PDF，修改结果可再次用于诊断。"
    ),
    (
        "4. 面试与行动跟踪：根据岗位要求和简历薄弱点生成模拟面试，"
        "记录回答与反馈，并形成目标岗位、材料进度和截止时间清单。"
    ),
    "二、智能体方案与工作流程",
    (
        "系统按“材料解析—要求拆解—证据匹配—规则评分—建议生成—面试训练”协同工作。"
        "解析智能体提取简历和岗位结构；匹配智能体输出证据矩阵；程序计算参考分并检查硬性条件；"
        "建议智能体只优化真实表达；面试智能体针对证据不足项追问。"
        "学生确认后可生成脱敏摘要，供就业指导教师复核。"
    ),
]

INNOVATION = (
    "一是校园专业能力映射。将专业课程、科研、竞赛、项目和实习转化为可解释的岗位能力证据，"
    "帮助缺少正式工作经历的本科生和研究生说明可迁移能力，避免只做关键词匹配。"
    "二是证据可追溯的求职闭环。每条结论关联岗位原文和简历证据，信息不足时明确标记；"
    "简历修改结果会反向更新适配判断，并继续影响面试追问和行动建议。"
    "三是校园就业协同。学生可生成经本人确认的脱敏准备摘要，教师据此查看已有证据、"
    "反复出现的短板和待确认事项，将AI诊断与人工就业指导衔接起来。"
    "系统进一步把证据缺口、材料进度和岗位截止时间转化为行动优先级，"
    "帮助学生持续完成求职准备。"
)

PROGRESS = (
    "已完成比赛真实需求梳理、产品流程、技术路线和评分边界设计，并开发本地静态MVP："
    "支持简历文字与岗位要求输入、模拟岗位诊断、证据和差距展示、修改建议及材料不足提示。"
    "已建立Git版本管理、DeepSeek提示词测试目录、竞品对照、PDF简历方案和申报材料底稿。"
    "下一步将先校准评分规则和提示词，开发原创A4模板、结构化简历编辑与PDF导出；"
    "随后接入DeepSeek和普通PDF导入，完善邮箱账号、历史记录及模拟面试，"
    "通过学生试用和岗位测试后完成部署与比赛演示。"
)

EXPECTED_RESULTS = (
    "拟形成一套可访问的“职引者”求职助手网站，覆盖岗位诊断、简历编辑与PDF导出、"
    "求职记录和模拟面试功能，并形成演示视频、使用说明和测试记录。"
    "效果验证计划使用5—8份自建或授权脱敏简历、10—20个公开岗位信息，"
    "人工标注匹配、部分匹配、不匹配和信息不足案例，检查系统排序是否符合常识、"
    "每条结论是否引用简历证据、修改建议是否具体可执行。另邀请5—10名学生试用，"
    "记录任务完成情况、诊断耗时、修改前后证据覆盖变化和主观反馈。"
    "系统输出仅用于求职准备，不承诺面试机会或录用结果。"
)


def remove_extra_paragraphs(cell, keep_index: int = 0):
    paragraphs = list(cell.paragraphs)
    keep = paragraphs[keep_index]
    for paragraph in paragraphs:
        if paragraph is not keep:
            paragraph._element.getparent().remove(paragraph._element)
    for child in list(keep._p):
        if child.tag != qn("w:pPr"):
            keep._p.remove(child)
    return keep


def set_paragraph_text(
    paragraph,
    text: str,
    *,
    font_name: str = "Segoe UI",
    font_size: float = 12,
    bold: bool = False,
):
    run = paragraph.add_run(text)
    run.font.name = font_name
    run.font.size = Pt(font_size)
    run.bold = bold
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), font_name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), font_name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), font_name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:cs"), font_name)
    return run


def replace_cell(cell, paragraphs: list[str], *, font_name: str, font_size: float):
    first = remove_extra_paragraphs(cell)
    set_paragraph_text(first, paragraphs[0], font_name=font_name, font_size=font_size)
    for text in paragraphs[1:]:
        paragraph = cell.add_paragraph()
        set_paragraph_text(paragraph, text, font_name=font_name, font_size=font_size)


def replace_single_paragraph(cell, text: str, *, font_name: str, font_size: float):
    replace_cell(cell, [text], font_name=font_name, font_size=font_size)


def main() -> None:
    document = Document(SOURCE)
    tables = document.tables

    replace_single_paragraph(
        tables[0].cell(0, 3),
        (
            "□ AI+学习科研   ☑ AI+校园服务与治理\n"
            "□ AI+创新创业   ☑ 校园真实需求挑战   □ 其他：____"
        ),
        font_name="Times New Roman",
        font_size=9,
    )
    replace_single_paragraph(
        tables[0].cell(1, 3),
        (
            "□ 创意构思  □ 已确定方案  ☑ 正在开发\n"
            "☑ 已有初步原型  □ 已有较完整作品"
        ),
        font_name="Times New Roman",
        font_size=9,
    )

    replace_single_paragraph(
        tables[2].cell(1, 0),
        PROJECT_INTRO,
        font_name="Segoe UI",
        font_size=12,
    )
    replace_cell(
        tables[3].cell(1, 0),
        FEATURE_PARAGRAPHS,
        font_name="Segoe UI",
        font_size=12,
    )
    replace_single_paragraph(
        tables[4].cell(1, 0),
        INNOVATION,
        font_name="Segoe UI",
        font_size=12,
    )
    for paragraph in tables[4].rows[0].cells[0].paragraphs:
        paragraph.paragraph_format.keep_with_next = True
    replace_single_paragraph(
        tables[5].cell(1, 0),
        PROGRESS,
        font_name="Segoe UI",
        font_size=12,
    )
    replace_single_paragraph(
        tables[6].cell(1, 0),
        EXPECTED_RESULTS,
        font_name="Segoe UI",
        font_size=12,
    )
    replace_single_paragraph(
        tables[7].cell(0, 0),
        (
            "☑ 仅使用公开数据或自建数据    ☑ 使用模拟或脱敏数据    "
            "□ 可能涉及学校内部数据\n"
            "☑ 可能涉及个人信息            □ 目前尚未确定"
        ),
        font_name="Times New Roman",
        font_size=9,
    )
    replace_single_paragraph(
        tables[8].cell(0, 1),
        (
            "已完成本地HTML MVP，可现场演示；公开网址和项目源码链接待上传GitHub后补充。"
        ),
        font_name="Times New Roman",
        font_size=8.5,
    )
    replace_single_paragraph(
        tables[8].cell(1, 1),
        (
            "已完成完整简历、短简历及材料不足等模拟场景的页面测试；"
            "尚未开展真实用户试用。后续将补充岗位匹配和用户试用记录。"
        ),
        font_name="Times New Roman",
        font_size=8.5,
    )
    replace_single_paragraph(
        tables[8].cell(2, 1),
        (
            "项目当前未使用学校内部数据。后续场景验证将在授权、脱敏和最小化使用原则下开展，"
            "并对第三方模型和开源资源履行许可与标注要求。"
        ),
        font_name="Times New Roman",
        font_size=8.5,
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    document.save(OUTPUT)

    print(f"intro={len(PROJECT_INTRO)}")
    print(f"features={sum(len(p) for p in FEATURE_PARAGRAPHS)}")
    print(f"innovation={len(INNOVATION)}")
    print(f"progress={len(PROGRESS)}")
    print(f"expected={len(EXPECTED_RESULTS)}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
