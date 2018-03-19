import { MatrixAppservice } from "./matrix";

export class MatrixEventHandler {
    private matrix: MatrixAppservice;

    constructor(matrix: MatrixAppservice) {
        this.matrix = matrix;
    }

    public onRoomMemberEvent(request, context) {
        console.log("m.room.member Event! ");
        console.log(request.getData());
    }
}
