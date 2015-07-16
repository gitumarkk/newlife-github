var App = {};

App.GithubIssuesModel = Backbone.Model.extend({
    urlRoot: "https://api.github.com/repos/newlif/teams/issues"
});

App.GithubIssuesCollection = Backbone.Collection.extend({
    url: "https://api.github.com/repos/newlif/teams/issues",
    model: App.GithubIssuesModel,
    git_labels: function() {
        var self = this,
            models = self.models;
        var labels = _.flatten(_.map(self.models, function (item) {
            return item.attributes.labels;
        }));
        return _.sortBy(_.uniq(labels, function(item) { return item.name; }), "name");
    },
    getCollectionLabel: function(label) {
        var self = this;
        var filteredCollection = this.filter(function(model) {
            var labels = _.map(_.flatten(model.get("labels")), function(item) {
                return item.name;
            });
            return labels.indexOf(label) !== -1;
        });
        return _.map(filteredCollection, function(model) {
            return model.attributes;
        });
    }
});

App.AppView = Backbone.View.extend({
    el: "#workspace",
    git_collection: new App.GithubIssuesCollection(),
    events: {
        "click .issues-nav a": "renderLabel"
    },
    initialize: function(options) {
        var self = this;
        _.bindAll(
            self,
            "render",
            "renderLabel",
            "gitFetchError");

        self.issues_template = _.template($("#github-issues-template").html());
        self.git_collection.fetch({
            success: self.render,
            error: self.gitFetchError
        });

        return this;
    },
    render: function() {
        var self = this,
            labels = self.git_collection.git_labels();

        _.each(labels, function(label) {
            self.$("#issues-nav").append(
                '<li role="presentation" class="issues-nav"><a data-label="' + label.name +
                '" href="#">' + label.name + '</a></li>');
        });

        self.$("#workspace-items").html(self.issues_template({
            issues: self.git_collection.toJSON()
        }));
    },

    renderLabel: function(ev) {
        var self = this,
            $element = $(ev.currentTarget),
            label = $element.data("label");

        self.$("#issue-nav li").removeClass("active");

        ev.preventDefault();

        if (label === "default") {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.toJSON()
            }));
        } else {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.getCollectionLabel(label)
            }));
        }
        $element.addClass("active");
    },

    gitFetchError: function(response, options, status) {
        var self = this;
        console.error(response, options);
    },
});

$(document).ready(function() {
    new App.AppView({});
});
