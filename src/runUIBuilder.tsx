//@ts-nocheck
import { bitable, IField, IRecord, ITable, UIBuilder } from "@lark-base-open/js-sdk";

export default async function main(uiBuilder: UIBuilder, { t }) {
    uiBuilder.markdown(`
  > ${t('Welcome')}，这是一个 UIBuilder 的演示插件  
  你可以在 \`uiBuilder.markdown\` 或者 \`uiBuilder.text\` 中输出交互内容，功能演示&反馈请查阅 👉 [使用指南](https://feishu.feishu.cn/docx/OHxZdBQrVo5uudx1moIcL5jcn3c)
  
  `);
    uiBuilder.form((form) => ({
        formItems: [
            form.inputNumber('startWeek', { label: '开始周', defaultValue: 1 }),
            form.inputNumber('endWeek', { label: '结束周', defaultValue: 52 }),
        ],
        buttons: ['生成周报'],
    }), async ({ key, values }) => {
        const { startWeek, endWeek } = values;
        let inputInfo = `开始周：${startWeek}，结束周：${endWeek}，全部数据：${JSON.stringify(values)}`;
        const selection = await bitable.base.getSelection();
        const table = await bitable.base.getTableById(selection?.tableId!);
        let tableName = await getTableInfo(table);
        let tableInfo = `${tableName}`

        let reportExporter = new ReportExporter(table);
        await reportExporter.init();
        reportExporter.setFilterRange(startWeek, endWeek);

        let reportText = await reportExporter.getReportText(table);
        uiBuilder.text(inputInfo);
        uiBuilder.markdown(`你点击了**${key}**按钮`);
        uiBuilder.form(
            (form) => ({
                formItems: [
                    form.textArea('reportText', { defaultValue: `${reportText}`, autoSize: true, label: '生成的内容' })
                ]
            })
        )
    });

    uiBuilder.buttons('Cat or Dog?', ['Cat', 'Dog'], catOrDog => {
        uiBuilder.text(`You click ${catOrDog}`);
    });
}

enum ReportKey {
    Des = "task_description",
    Group = "task_group",
    State = "state",
    FinishWeek = "finish_week",
    Parent = "Parent items"
}

class ReportExporter {



    table: ITable;
    start: number;
    end: number;
    taskDesField: IField;
    taskGroupField: IField;
    taskStateField: IField;
    taskParentField: IField;

    constructor(table: ITable) {
        this.table = table;
    }

    async init() {
        this.taskDesField = await this.table.getFieldByName(ReportKey.Des);
        this.taskGroupField = await this.table.getFieldByName(ReportKey.Group);
        this.taskStateField = await this.table.getFieldByName(ReportKey.State);
        this.taskParentField = await this.table.getFieldByName(ReportKey.Parent);
    }

    /**
     * setFilterRange
     */
    public setFilterRange(start, end) {
        this.start = start;
        this.end = end;
    }

    async getReportText(): string {
        if (!this.validateReportTable(this.table)) {
            console.error("not a valid table for generation")
        }

        console.log(await this.table.getName());
        let allRecords = await this.getDesiredRecord();
        console.log(`allRecords: ${allRecords.map(i => i.recordId)}`);

        return await this.getIntentedReportText(allRecords);
    }

    async getIntentedReportText(filteredRecords: IRecord[]) {
        console.log(await this.taskDesField.getName());
        console.log(await this.taskGroupField.getName());
        let grouped_des = new Map<string, Array<string>>();
        grouped_des.set('其他', new Array<string>());
        if (this.taskGroupField == null) {
            let allTaskDes = await Promise.all(filteredRecords.map(async record => {
                let desValue = await this.taskDesField.getValue(record.recordId);
                // console.log("条目数据" + desValue);
                return this.getCellTextFromValue(desValue);
            }));
            grouped_des.get('其他')?.concat(allTaskDes);
        } else {
            for (let record of filteredRecords) {
                let taskDes = this.getCellTextFromValue(await this.taskDesField.getValue(record.recordId)); // flaten to plain text
                let taskState = (await this.taskStateField.getValue(record.recordId)).text;
                let parent = await this.taskParentField.getValue(record.recordId);
                if (parent != null) {
                    continue;
                }
                taskDes += (taskState == "处理中" ? '（未完成）' : '');
                console.log(taskState);
                if (taskDes == null) {
                    continue;
                }
                let groupValue = await this.taskGroupField.getValue(record.recordId);
                if (groupValue == null) {
                    grouped_des.get('其他')?.push(taskDes);
                    continue;
                }
                let group = groupValue[0].text;
                if (grouped_des.has(group)) {
                    grouped_des.get(group)?.push(taskDes);
                } else {
                    grouped_des.set(group, new Array<string>());
                }
            }
        }
        console.log(grouped_des);

        let groupId = 1;
        let lines = new Array<string>();
        for (let group of grouped_des.entries()) {
            lines.push(`${groupId++}. ${group[0]}`)
            for (let des of group[1]) {
                lines.push(`  * ${des}`);
            }
        }
        return lines.join(`\n`);
    }

    getCellTextFromValue(textCellValue) {
        return textCellValue.map(i => i.text).join('');
    }

    async getDesiredRecord(): IRecord[] {
        let stateFilter = `OR(CurrentValue.[${ReportKey.State}] = "处理完成", CurrentValue.[${ReportKey.State}] = "处理中")`;
        let timeFilter = `AND(CurrentValue.[${ReportKey.FinishWeek}] >= ${this.start}, CurrentValue.[${ReportKey.FinishWeek}] <= ${this.end})`

        return (await this.table.getRecords({
            pageSize: 500,
            filter: `AND(${stateFilter}, ${timeFilter})`
        })).records //filter参见 https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-record/list
    }

    async validateReportTable(): boolean {
        if (this.taskDesField == null) {
            return false;
        }
        console.log(this.taskDesField);
        let finishWeek = await this.table.getFieldByName('finish_week');
        if (finishWeek == null) {
            return false;
        }
        return true;
    }
}

async function getTableInfo(table: ITable) {
    return await table.getName();
}






